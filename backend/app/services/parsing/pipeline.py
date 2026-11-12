from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import Path

from app.core.database import BACKEND_DIR
from app.domain.enums import InstitutionCode
from app.domain.account_products import kind_for_account_type
from app.domain.product_types import ProductKind
from app.domain.parsers import DocumentKind, PARSER_DEFINITIONS, ParserKey
from app.schemas.statement import PdfIssue, PdfPreview
from .extractor import _build_reader, _extract_pdf_content, _build_preview_lines
from .models import PdfContent, PdfImportError, PublicPdfError, ParserResult
from .registry import _resolve_parser, _validate_document, _parse_document
from .institutions.banco_chile_credit_national import extract_banco_chile_credit_last4
from .institutions.falabella_cmr_national import extract_falabella_cmr_last4


MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024
RAW_DIR = BACKEND_DIR / "data" / "raw"

INSTITUTION_NAMES = {
    InstitutionCode.BANCO_DE_CHILE: "Banco de Chile",
    InstitutionCode.BANCO_SANTANDER: "Banco Santander",
    InstitutionCode.BANCO_ESTADO: "BancoEstado",
    InstitutionCode.BANCO_FALABELLA: "Banco Falabella",
    InstitutionCode.MERCADOPAGO: "Mercado Pago",
    InstitutionCode.COPECPAY: "Copec Pay",
}


def _recognized_parser(
    text: str, requested: ParserKey, *,
    exclude: ParserKey | None = None, account_kind: ProductKind | None = None,
) -> ParserKey:
    """Prefer a specific credit layout; fall back to the selected account format."""
    matching_credit: list[ParserKey] = []
    for definition in PARSER_DEFINITIONS:
        if definition.key == exclude or (account_kind and account_kind not in definition.product_kinds):
            continue
        if definition.document_kind != DocumentKind.CREDIT_NATIONAL:
            continue
        try:
            _validate_document(definition.key, text)
        except PdfImportError:
            continue
        matching_credit.append(definition.key)
    if requested in matching_credit:
        return requested
    if len(matching_credit) == 1:
        return matching_credit[0]
    if len(matching_credit) > 1:
        raise PublicPdfError("AMBIGUOUS_FORMAT", "El PDF coincide con más de un formato de tarjeta.", "Revisa el documento antes de volver a analizarlo.")
    try:
        if requested != exclude:
            _validate_document(requested, text)
            return requested
    except PdfImportError:
        pass
    matching_accounts: list[ParserKey] = []
    for definition in PARSER_DEFINITIONS:
        if definition.key == exclude or (account_kind and account_kind not in definition.product_kinds):
            continue
        if definition.document_kind != DocumentKind.ACCOUNT_MOVEMENTS:
            continue
        try:
            _validate_document(definition.key, text)
        except PdfImportError:
            continue
        matching_accounts.append(definition.key)
    if len(matching_accounts) == 1:
        return matching_accounts[0]
    if len(matching_accounts) > 1:
        raise PublicPdfError("AMBIGUOUS_FORMAT", "El PDF coincide con más de un formato de cuenta.", "Revisa el documento antes de volver a analizarlo.")
    raise PublicPdfError(
        "UNSUPPORTED_FORMAT",
        "No pudimos reconocer un formato de cartola compatible en este PDF.",
        "Revisa el banco y tipo de documento, o selecciona otro PDF.",
    )


ACCOUNT_KIND_NAMES = {
    ProductKind.CURRENT: "Cuenta corriente",
    ProductKind.SIGHT: "Cuenta vista",
    ProductKind.SAVINGS: "Cuenta de ahorro",
    ProductKind.CREDIT: "Tarjeta de crédito",
    ProductKind.PREPAID_WALLET: "Billetera o prepago",
}


def _detect_account_kind(text: str) -> ProductKind | None:
    """Use explicit headers only; transaction descriptions are not evidence."""
    matches: set[ProductKind] = set()
    for raw_line in text.splitlines():
        line = " ".join("".join(
            char for char in unicodedata.normalize("NFKD", raw_line.upper())
            if not unicodedata.combining(char)
        ).split())
        if re.match(r"^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b", line):
            break
        if re.match(r"^(?:FECHA\s+|MOVIMIENTOS?\s+(?:DE\s+)?(?:SU\s+CUENTA|TARJETA)|LISTADO DE MOVIMIENTOS)", line):
            break
        if re.match(r"^ESTADO DE CUENTA.*TARJETA DE CREDITO\b", line):
            matches.add(ProductKind.CREDIT)
        line = re.sub(r"^TIPO DE CUENTA\s*:\s*(?:CUENTA\s+)?", "CUENTA ", line)
        header = re.match(
            r"^(?:(?:CARTOLA|ESTADO(?: DE CUENTA)?)(?: DE)?\s+)?"
            r"CUENTA\s+(CORRIENTE|VISTA|(?:DE\s+)?AHORRO)\b", line,
        )
        if header:
            matches.add({
                "CORRIENTE": ProductKind.CURRENT, "VISTA": ProductKind.SIGHT,
                "AHORRO": ProductKind.SAVINGS, "DE AHORRO": ProductKind.SAVINGS,
            }[header.group(1)])
    return next(iter(matches)) if len(matches) == 1 else None


def _parse_with_recovery(
    pdf_content: PdfContent, requested: ParserKey, expected_type: str | None,
) -> tuple[ParserKey, ParserResult, list[str], list[PdfIssue]]:
    """Keep successful previews; diagnose type and try one recognized alternative on failure."""
    text = pdf_content.text

    def attempt(key: ParserKey) -> tuple[ParserResult, list[str]]:
        warnings: list[str] = []
        result = _parse_document(
            key, text, layout_lines=pdf_content.layout_lines,
            vertical_edges=pdf_content.vertical_edges, validation_warnings=warnings,
        )
        if not result[0]:
            raise PublicPdfError("NO_TRANSACTIONS", "No se detectaron movimientos para importar.", "Revisa que el PDF contenga el detalle de movimientos.")
        return result, warnings

    try:
        # Preserve specific credit recognition: a bank logo alone must not let
        # an account parser interpret a credit statement as account movements.
        if _recognized_parser(text, requested) != requested:
            raise PublicPdfError("UNSUPPORTED_FORMAT", "El PDF no corresponde al formato esperado para esta cuenta.")
        result, warnings = attempt(requested)
        return requested, result, warnings, []
    except PdfImportError as primary_error:
        detected_kind = _detect_account_kind(text)
        expected_kind = kind_for_account_type(expected_type) if expected_type else None
        issues: list[PdfIssue] = []
        if detected_kind is None:
            diagnostic = "No se pudo comprobar el tipo de cuenta en los encabezados del PDF."
            issues.append(PdfIssue(code="ACCOUNT_TYPE_UNVERIFIED", message=diagnostic,
                action="Comprueba que la cartola corresponde a la cuenta seleccionada."))
        elif expected_kind and detected_kind != expected_kind:
            diagnostic = f"El PDF indica {ACCOUNT_KIND_NAMES[detected_kind]} y seleccionaste {ACCOUNT_KIND_NAMES[expected_kind]}."
            issues.append(PdfIssue(code="ACCOUNT_TYPE_MISMATCH", message=diagnostic,
                action="Elige otra cuenta o revisa esta diferencia antes de continuar."))
        else:
            diagnostic = f"El encabezado indica {ACCOUNT_KIND_NAMES[detected_kind]}."
        try:
            alternative = _recognized_parser(text, requested, exclude=requested, account_kind=detected_kind)
            result, warnings = attempt(alternative)
        except PdfImportError as recovery_error:
            code = primary_error.code if isinstance(primary_error, PublicPdfError) else "PDF_UNREADABLE"
            if isinstance(recovery_error, PublicPdfError) and recovery_error.code == "AMBIGUOUS_FORMAT":
                code = recovery_error.code
            message = "No se pudieron obtener movimientos con un formato compatible. " + diagnostic
            raise PublicPdfError(code, message, "Revisa la cuenta elegida y el formato de la cartola; puedes intentar con otro PDF.") from primary_error
        issues.insert(0, PdfIssue(
            code="PARSER_FALLBACK", message="El formato esperado no permitió leer la cartola; se usó otro formato reconocido. " + diagnostic,
            action="Compara los movimientos detectados con el PDF antes de confirmar.",
        ))
        return alternative, result, warnings, issues


def _credit_last4(parser_key: ParserKey, text: str) -> str | None:
    if parser_key == ParserKey.BANCO_CHILE_CREDIT_NATIONAL:
        return extract_banco_chile_credit_last4(text)
    if parser_key == ParserKey.SANTANDER_CREDIT_NATIONAL:
        match = re.search(r"XXXX\s+XXXX\s+XXXX\s+(\d{4})", text)
        return match.group(1) if match else None
    if parser_key == ParserKey.FALABELLA_CMR_NATIONAL:
        return extract_falabella_cmr_last4(text)
    return None

def inspect_pdf(
    *,
    file_name: str,
    file_bytes: bytes,
    institution: InstitutionCode,
    parser_key: ParserKey | None = None,
    expected_last4: str | None = None,
    expected_account_type: str | None = None,
    password: str | None = None,
    preview_line_limit: int = 20,
) -> PdfPreview:
    """Valida un PDF y devuelve una vista previa parseada sin persistir datos."""
    if not file_bytes:
        raise PublicPdfError("EMPTY_FILE", "El archivo está vacío.", "Selecciona otro PDF.")
    if len(file_bytes) > MAX_PDF_SIZE_BYTES:
        raise PublicPdfError("FILE_TOO_LARGE", "El PDF supera el límite de 10 MB.", "Selecciona un archivo más pequeño.")
    if not file_name.lower().endswith(".pdf"):
        raise PublicPdfError("INVALID_FILE_TYPE", "El archivo debe ser un PDF.", "Selecciona un archivo .pdf.")

    reader, requires_password = _build_reader(file_bytes, password)
    if len(reader.pages) > 50:
        raise PublicPdfError("TOO_MANY_PAGES", "El PDF supera el límite de 50 páginas.", "Selecciona una cartola más corta.")
    pdf_content = _extract_pdf_content(file_bytes, password)
    extracted_text = pdf_content.text
    preview_lines = _build_preview_lines(extracted_text, preview_line_limit)
    if not preview_lines:
        raise PublicPdfError("NO_SELECTABLE_TEXT", "No se detectó texto seleccionable en el PDF.", "Descarga la cartola original del banco; las imágenes escaneadas aún no se pueden analizar.")

    parser_key = parser_key or _resolve_parser(institution)
    detected_parser, parsed, validation_warnings, issues = _parse_with_recovery(
        pdf_content, parser_key, expected_account_type,
    )
    candidates, parsing_errors, period_month = parsed
    requested_definition = next(item for item in PARSER_DEFINITIONS if item.key == parser_key)
    detected_definition = next(item for item in PARSER_DEFINITIONS if item.key == detected_parser)
    if detected_definition.institution != institution:
        issues.append(PdfIssue(
            code="BANK_MISMATCH",
            message=f"Seleccionaste {INSTITUTION_NAMES[institution]}, pero el PDF corresponde a {INSTITUTION_NAMES[detected_definition.institution]}.",
            action="Elige otra cuenta o acepta expresamente guardar estos movimientos en la cuenta seleccionada.",
        ))
    if detected_definition.document_kind != requested_definition.document_kind:
        issues.append(PdfIssue(
            code="DOCUMENT_TYPE_MISMATCH",
            message="El tipo de documento no coincide con el producto de la cuenta seleccionada.",
            action="Elige otra cuenta o revisa cuidadosamente los movimientos antes de continuar.",
        ))
    if detected_definition.document_kind == DocumentKind.CREDIT_NATIONAL:
        found_last4 = _credit_last4(detected_parser, extracted_text)
        if not expected_last4:
            issues.append(PdfIssue(
                code="CARD_LAST4_NOT_CONFIGURED",
                message="La cuenta seleccionada no tiene guardados los últimos cuatro dígitos de la tarjeta.",
                action="Agrégalos a la cuenta o comprueba manualmente que este PDF le corresponde.",
            ))
        elif found_last4 is None:
            issues.append(PdfIssue(
                code="CARD_LAST4_UNREADABLE",
                message="No pudimos comprobar los últimos cuatro dígitos de la tarjeta en el PDF.",
                action="Comprueba manualmente que la tarjeta corresponde a la cuenta seleccionada.",
            ))
        elif found_last4 != expected_last4:
            issues.append(PdfIssue(
                code="CARD_LAST4_MISMATCH",
                message=f"La tarjeta del PDF termina en {found_last4} y la cuenta seleccionada en {expected_last4}.",
                action="Elige otra cuenta, corrige sus dígitos o acepta expresamente esta diferencia.",
            ))
    checksum = hashlib.sha256(file_bytes).hexdigest()

    if validation_warnings:
        issues.append(PdfIssue(
            code="TOTAL_MISMATCH",
            message=validation_warnings[0],
            action="Compara cada cargo y abono con el PDF antes de aceptar esta diferencia.",
        ))
    if parsing_errors:
        issues.append(PdfIssue(
            code="ROWS_UNREADABLE",
            message=f"No se pudieron interpretar {len(parsing_errors)} filas del PDF.",
            action="Revisa el detalle: esas filas no se importarán si decides continuar.",
        ))

    return PdfPreview(
        parser_key=detected_parser,
        file_name=file_name,
        file_checksum=checksum,
        page_count=len(reader.pages),
        is_encrypted=requires_password,
        used_password=requires_password and bool(password),
        preview_lines=preview_lines,
        extracted_text_length=len(extracted_text),
        period_month=period_month,
        candidate_transactions=candidates,
        parsing_errors=parsing_errors,
        issues=issues,
    )


def save_raw_pdf(file_name: str, file_bytes: bytes, checksum: str) -> str:
    """Guarda el PDF original con nombre estable y devuelve su ruta relativa."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file_name).name)
    target = RAW_DIR / f"{checksum[:12]}_{safe_name}"
    if not target.exists():
        target.write_bytes(file_bytes)
    return str(target.relative_to(BACKEND_DIR))
