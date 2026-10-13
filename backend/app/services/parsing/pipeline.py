from __future__ import annotations

import hashlib
import re
from pathlib import Path

from app.core.database import BACKEND_DIR
from app.domain.enums import InstitutionCode
from app.domain.parsers import DocumentKind, PARSER_DEFINITIONS, ParserKey
from app.schemas.statement import PdfIssue, PdfPreview
from .extractor import _build_reader, _extract_pdf_content, _build_preview_lines
from .models import PdfImportError, PublicPdfError
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


def _recognized_parser(text: str, requested: ParserKey) -> ParserKey:
    """Prefer a specific credit layout; fall back to the selected account format."""
    matching_credit: list[ParserKey] = []
    for definition in PARSER_DEFINITIONS:
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
    try:
        _validate_document(requested, text)
        return requested
    except PdfImportError:
        pass
    matching_accounts: list[ParserKey] = []
    for definition in PARSER_DEFINITIONS:
        if definition.document_kind != DocumentKind.ACCOUNT_MOVEMENTS:
            continue
        try:
            _validate_document(definition.key, text)
        except PdfImportError:
            continue
        matching_accounts.append(definition.key)
    if len(matching_accounts) == 1:
        return matching_accounts[0]
    raise PublicPdfError(
        "UNSUPPORTED_FORMAT",
        "No pudimos reconocer un formato de cartola compatible en este PDF.",
        "Revisa el banco y tipo de documento, o selecciona otro PDF.",
    )


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
    detected_parser = _recognized_parser(extracted_text, parser_key)
    requested_definition = next(item for item in PARSER_DEFINITIONS if item.key == parser_key)
    detected_definition = next(item for item in PARSER_DEFINITIONS if item.key == detected_parser)
    issues: list[PdfIssue] = []
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

    validation_warnings: list[str] = []
    candidates, parsing_errors, period_month = _parse_document(
        detected_parser,
        extracted_text,
        layout_lines=pdf_content.layout_lines,
        vertical_edges=pdf_content.vertical_edges,
        validation_warnings=validation_warnings,
    )
    if not candidates:
        raise PublicPdfError("NO_TRANSACTIONS", "No se detectaron movimientos para importar.", "Revisa que este PDF contenga el detalle de movimientos.")
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
