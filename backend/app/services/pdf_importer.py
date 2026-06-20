from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import partial
from io import BytesIO
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from app.core.database import BACKEND_DIR
from app.domain.enums import InstitutionCode, TransactionType
from app.domain.normalizer import normalize_amount_clp, normalize_description
from app.domain.parsers import ParserKey, get_parser_for_institution
from app.schemas.statement import PdfPreview
from app.schemas.transaction import TransactionCandidate


MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024
RAW_DIR = BACKEND_DIR / "data" / "raw"
TABULAR_DATE_LINE_PATTERN = re.compile(
    r"^\s*(\d{2}[/-]\d{2}(?:[/-]\d{4})?)"
    r"(?:\s+(\d{2}:\d{2}(?::\d{2})?))?\s+(.+)$"
)
AMOUNT_PATTERN = re.compile(
    r"(?<![\w/])(?:CLP\s*)?\$?\s*[+-]?"
    r"(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?![\w/])",
    re.IGNORECASE,
)
IGNORED_MOVEMENT_PREFIXES = (
    "SALDO INICIAL",
    "SALDO FINAL",
    "TOTAL CARGOS",
    "TOTAL ABONOS",
)
STANDARD_DESDE_HASTA_PERIOD_PATTERNS = (
    re.compile(
        r"(?:PER[IÍ]ODO\s+)?DESDE\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})"
        r".*?(?:HASTA|AL)\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})",
        re.IGNORECASE | re.DOTALL,
    ),
    re.compile(
        r"PER[IÍ]ODO\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})"
        r"\s*(?:-|AL)\s*(\d{2}[/-]\d{2}[/-]\d{4})",
        re.IGNORECASE,
    ),
)
SANTANDER_POSITIONAL_PERIOD_PATTERNS = (
    re.compile(
        r"CARTOLA\s+DESDE\s+HASTA\s+P[AÁ]GINA"
        r".*?(\d{2}[/-]\d{2}[/-]\d{4})"
        r"\s+(\d{2}[/-]\d{2}[/-]\d{4})",
        re.IGNORECASE | re.DOTALL,
    ),
)
MERCADOPAGO_POSITIONAL_PERIOD_PATTERNS = (
    re.compile(
        r"DESDE\s+HASTA\s+FECHA\s+DE\s+GENERACI[OÃ“]N.*?"
        r"(\d{2}[/-]\d{2}[/-]\d{4})(?:\s+\d{2}:\d{2}:\d{2})?\s+"
        r"(\d{2}[/-]\d{2}[/-]\d{4})",
        re.IGNORECASE | re.DOTALL,
    ),
)
SANTANDER_CARD_PREFIX_PATTERN = re.compile(r"^\s*93\s+(?=COMPRA\b)", re.IGNORECASE)
SANTANDER_TRANSFER_PREFIX_PATTERN = re.compile(
    r"^\s*(?:(?:\d{1,8})\s+)?(?:401\s+)?(?:0?\d{7,10}\s+)?"
    r"(?=TRANSF\.|TRANSF A\b)",
    re.IGNORECASE,
)
SANTANDER_OPERATION_BRANCH_PREFIX_PATTERN = re.compile(
    r"^\s*\d{6,8}\s+401\s+(?=[A-ZÃÃÃÃÃÃ*])",
    re.IGNORECASE,
)


class PdfImportError(ValueError):
    """Indica que un PDF no pudo validarse, leerse o parsearse."""

    pass


ParserResult = tuple[list[TransactionCandidate], list[str], str]
ParserHandler = Callable[..., ParserResult]
DocumentValidator = Callable[[str], None]
SummaryTotalsExtractor = Callable[[str], tuple[int, int] | None]
DescriptionNormalizer = Callable[[str], str]


@dataclass(frozen=True)
class LayoutWord:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float


@dataclass(frozen=True)
class LayoutLine:
    text: str
    page_index: int
    top: float
    words: tuple[LayoutWord, ...]


@dataclass(frozen=True)
class PdfContent:
    text: str
    layout_lines: tuple[LayoutLine, ...]


@dataclass(frozen=True)
class LayoutColumnProfile:
    expense_headers: tuple[str, ...]
    income_headers: tuple[str, ...]
    balance_headers: tuple[str, ...]
    description_headers: tuple[str, ...] = ("DESCRIPCION", "DESCRIPCIÃ“N")


@dataclass(frozen=True)
class LayoutColumnRanges:
    expense: tuple[float, float]
    income: tuple[float, float]
    balance: tuple[float, float]


@dataclass(frozen=True)
class TabularParserProfile:
    display_name: str
    document_markers: tuple[str, ...]
    period_patterns: tuple[re.Pattern[str], ...]
    income_keywords: tuple[str, ...]
    expense_keywords: tuple[str, ...]
    continuation_lines: bool = False
    movement_start_markers: tuple[str, ...] = ()
    movement_end_markers: tuple[str, ...] = ()
    summary_totals_extractor: SummaryTotalsExtractor | None = None
    layout_columns: LayoutColumnProfile | None = None
    description_normalizer: DescriptionNormalizer | None = None


@dataclass(frozen=True)
class TabularLine:
    text: str
    layout_line: LayoutLine | None = None


def inspect_pdf(
    *,
    file_name: str,
    file_bytes: bytes,
    institution: InstitutionCode,
    password: str | None = None,
    preview_line_limit: int = 20,
) -> PdfPreview:
    """Valida un PDF y devuelve una vista previa parseada sin persistir datos."""
    if not file_bytes:
        raise PdfImportError("El archivo PDF esta vacio.")
    if len(file_bytes) > MAX_PDF_SIZE_BYTES:
        raise PdfImportError("El PDF supera el limite de 10 MB.")
    if not file_name.lower().endswith(".pdf"):
        raise PdfImportError("El archivo debe tener extension PDF.")

    reader, requires_password = _build_reader(file_bytes, password)
    pdf_content = _extract_pdf_content(file_bytes, password)
    extracted_text = pdf_content.text
    preview_lines = _build_preview_lines(extracted_text, preview_line_limit) # no se ocupa en el front
    if not preview_lines:
        raise PdfImportError(
            "No se detecto texto seleccionable. El PDF probablemente requiere OCR, "
            "que aun no esta soportado."
        )

    parser_key = _resolve_parser(institution)
    _validate_document(parser_key, extracted_text)
    checksum = hashlib.sha256(file_bytes).hexdigest()

    candidates, parsing_errors, period_month = _parse_document(
        parser_key,
        extracted_text,
        layout_lines=pdf_content.layout_lines,
    )

    return PdfPreview(
        parser_key=parser_key,
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
    )


def save_raw_pdf(file_name: str, file_bytes: bytes, checksum: str) -> str:
    """Guarda el PDF original con nombre estable y devuelve su ruta relativa."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file_name).name)
    target = RAW_DIR / f"{checksum[:12]}_{safe_name}"
    if not target.exists():
        target.write_bytes(file_bytes)
    return str(target.relative_to(BACKEND_DIR))


def _build_reader(
    file_bytes: bytes,
    password: str | None,
) -> tuple[PdfReader, bool]:
    """Construye un lector PDF validando apertura y contrasena si aplica."""
    try:
        reader = PdfReader(BytesIO(file_bytes))
    except Exception as error:
        raise PdfImportError(f"No se pudo abrir el PDF: {error}") from error

    requires_password = False
    if reader.is_encrypted:
        try:
            opens_with_empty_password = reader.decrypt("") != 0
        except Exception:
            opens_with_empty_password = False

        if opens_with_empty_password:
            return reader, False

        requires_password = True
        if not password:
            raise PdfImportError(
                "El PDF esta protegido. Ingresa la contrasena para continuar."
            )
        try:
            if reader.decrypt(password) == 0:
                raise PdfImportError("La contrasena del PDF es incorrecta.")
        except PdfImportError:
            raise
        except Exception as error:
            raise PdfImportError("No se pudo validar la contrasena del PDF.") from error
    return reader, requires_password


def _extract_pdf_content(file_bytes: bytes, password: str | None) -> PdfContent:
    """Extrae texto plano y palabras con posicion desde un PDF en una pasada."""
    try:
        with pdfplumber.open(BytesIO(file_bytes), password=password) as pdf:
            page_texts: list[str] = []
            layout_lines: list[LayoutLine] = []
            for page_index, page in enumerate(pdf.pages):
                page_texts.append(page.extract_text() or "")
                layout_lines.extend(_extract_layout_lines(page, page_index))
            return PdfContent(
                text="\n".join(page_texts).strip(),
                layout_lines=tuple(layout_lines),
            )
    except Exception as error:
        raise PdfImportError(f"No se pudo extraer texto del PDF: {error}") from error


def _extract_layout_lines(page, page_index: int) -> list[LayoutLine]:
    """Agrupa palabras de pdfplumber en lineas visuales conservando coordenadas."""
    raw_words = page.extract_words(
        use_text_flow=False,
        keep_blank_chars=False,
        x_tolerance=2,
        y_tolerance=3,
    )
    sorted_words = sorted(raw_words, key=lambda word: (word["top"], word["x0"]))
    grouped_words: list[list[LayoutWord]] = []

    for raw_word in sorted_words:
        word = LayoutWord(
            text=str(raw_word["text"]),
            x0=float(raw_word["x0"]),
            x1=float(raw_word["x1"]),
            top=float(raw_word["top"]),
            bottom=float(raw_word["bottom"]),
        )
        if not grouped_words or abs(grouped_words[-1][0].top - word.top) > 3:
            grouped_words.append([word])
        else:
            grouped_words[-1].append(word)

    lines: list[LayoutLine] = []
    for words in grouped_words:
        ordered_words = tuple(sorted(words, key=lambda word: word.x0))
        text = " ".join(word.text for word in ordered_words)
        lines.append(
            LayoutLine(
                text=re.sub(r"\s+", " ", text).strip(),
                page_index=page_index,
                top=min(word.top for word in ordered_words),
                words=ordered_words,
            )
        )
    return lines


def _build_preview_lines(extracted_text: str, limit: int) -> list[str]:
    """Construye lineas limpias para mostrar en la previsualizacion."""
    lines: list[str] = []
    for raw_line in extracted_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line:
            lines.append(line)
        if len(lines) >= limit:
            break
    return lines


def _resolve_parser(institution: InstitutionCode) -> ParserKey:
    """Resuelve el parser PDF de una institucion como error de importacion."""
    try:
        return get_parser_for_institution(institution)
    except ValueError as error:
        raise PdfImportError(str(error)) from error


def _validate_document(parser_key: ParserKey, extracted_text: str) -> None:
    """Ejecuta el validador de institucion correspondiente al parser."""
    try:
        validator = PDF_DOCUMENT_VALIDATORS[parser_key]
    except KeyError as error:
        raise PdfImportError(
            f"El parser {parser_key.value} no tiene un validador PDF configurado."
        ) from error
    validator(extracted_text)


def _parse_document(
    parser_key: ParserKey,
    extracted_text: str,
    layout_lines: tuple[LayoutLine, ...] = (),
) -> ParserResult:
    """Despacha el texto extraido al parser registrado para la institucion."""
    try:
        parser = PDF_PARSERS[parser_key]
    except KeyError as error:
        raise PdfImportError(
            f"El parser {parser_key.value} no tiene una implementacion configurada."
        ) from error
    return parser(extracted_text, layout_lines=layout_lines)


def _build_institution_validator(
    profile: TabularParserProfile,
) -> DocumentValidator:
    """Crea un validador que confirma marcadores de la institucion esperada."""
    def validate(extracted_text: str) -> None:
        """Valida que el texto del PDF contenga marcadores del perfil."""
        upper_text = extracted_text.upper()
        if not any(marker in upper_text for marker in profile.document_markers):
            raise PdfImportError(
                f"El PDF no parece pertenecer a {profile.display_name}, que es la "
                "institucion de la cuenta seleccionada."
            )

    return validate


def _parse_tabular_document(
    extracted_text: str,
    profile: TabularParserProfile,
    layout_lines: tuple[LayoutLine, ...] = (),
) -> ParserResult:
    """Parsea cartolas tabulares y devuelve candidatos, errores y periodo."""
    explicit_period = _extract_optional_period(extracted_text, profile)
    layout_context = _build_layout_context(layout_lines, profile)
    candidates: list[TransactionCandidate] = []
    errors: list[str] = []

    for line in _iter_tabular_lines(extracted_text, profile, layout_context):
        try:
            candidate = _parse_tabular_line(
                line,
                profile,
                explicit_period,
                layout_context,
            )
        except ValueError as error:
            if len(errors) < 10:
                errors.append(f"{line.text} -> {error}")
            continue
        if candidate is not None:
            candidates.append(candidate)

    if explicit_period is not None:
        period_month = explicit_period[1].strftime("%Y-%m")
    elif candidates:
        period_month = max(candidate.date for candidate in candidates).strftime("%Y-%m")
    else:
        raise PdfImportError(
            f"No se pudo determinar el periodo de la cartola {profile.display_name}."
        )

    _validate_summary_totals(extracted_text, candidates, profile)
    return candidates, errors, period_month


def _iter_tabular_lines(
    extracted_text: str,
    profile: TabularParserProfile,
    layout_context: dict[str, object],
):
    """Itera solo las lineas que pueden representar movimientos tabulares."""
    normalized_text = extracted_text.upper()
    has_movement_header = any(
        marker in normalized_text for marker in profile.movement_start_markers
    )
    movement_active = not has_movement_header
    current_raw_date: str | None = None
    layout_by_text = layout_context["lines_by_text"]

    for raw_line in extracted_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue

        upper_line = line.upper()
        if any(marker in upper_line for marker in profile.movement_end_markers):
            movement_active = False
            current_raw_date = None
            continue
        if any(marker in upper_line for marker in profile.movement_start_markers):
            movement_active = True
            current_raw_date = None
            continue

        date_match = TABULAR_DATE_LINE_PATTERN.match(line)
        if date_match is not None:
            current_raw_date = date_match.group(1)
            if not movement_active:
                continue
            yield TabularLine(
                text=line,
                layout_line=_pop_layout_line(layout_by_text, line),
            )
            continue

        if (
            profile.continuation_lines
            and movement_active
            and current_raw_date is not None
            and "SALDO DIA" not in upper_line
            and AMOUNT_PATTERN.search(line)
        ):
            yield TabularLine(
                text=f"{current_raw_date} {line}",
                layout_line=_pop_layout_line(layout_by_text, line),
            )


def _build_layout_context(
    layout_lines: tuple[LayoutLine, ...],
    profile: TabularParserProfile,
) -> dict[str, object]:
    """Construye indices para cruzar filas de texto con rangos de columnas PDF."""
    lines_by_text: dict[str, list[LayoutLine]] = {}
    for line in layout_lines:
        lines_by_text.setdefault(_normalize_layout_text(line.text), []).append(line)

    return {
        "lines_by_text": lines_by_text,
        "column_ranges_by_page": _build_column_ranges_by_page(layout_lines, profile),
    }


def _pop_layout_line(
    lines_by_text: dict[str, list[LayoutLine]],
    text: str,
) -> LayoutLine | None:
    """Devuelve y consume la proxima linea posicionada que coincide con una fila."""
    matching_lines = lines_by_text.get(_normalize_layout_text(text))
    if not matching_lines:
        return None
    return matching_lines.pop(0)


def _normalize_layout_text(text: str) -> str:
    """Normaliza texto visual y extraido para compararlos de forma estable."""
    return re.sub(r"\s+", " ", text).strip().upper()


def _build_column_ranges_by_page(
    layout_lines: tuple[LayoutLine, ...],
    profile: TabularParserProfile,
) -> dict[int, LayoutColumnRanges]:
    """Infiere rangos de columnas de cargos, abonos y saldo por pagina."""
    if profile.layout_columns is None:
        return {}

    ranges_by_page: dict[int, LayoutColumnRanges] = {}
    page_indexes = sorted({line.page_index for line in layout_lines})
    for page_index in page_indexes:
        page_lines = _select_movement_header_lines(
            [line for line in layout_lines if line.page_index == page_index]
        )
        expense_center = _find_header_center(
            page_lines,
            profile.layout_columns.expense_headers,
        )
        income_center = _find_header_center(
            page_lines,
            profile.layout_columns.income_headers,
        )
        balance_center = _find_header_center(
            page_lines,
            profile.layout_columns.balance_headers,
        )
        description_center = _find_header_center(
            page_lines,
            profile.layout_columns.description_headers,
        )
        if None in (expense_center, income_center, balance_center):
            continue

        ranges_by_page[page_index] = _build_ordered_column_ranges(
            {
                "expense": expense_center,
                "income": income_center,
                "balance": balance_center,
            },
            description_center,
        )

    return ranges_by_page


def _build_ordered_column_ranges(
    column_centers: dict[str, float],
    description_center: float | None,
) -> LayoutColumnRanges:
    """Calcula rangos por cercania para soportar distintos ordenes de columnas."""
    ordered_columns = sorted(column_centers.items(), key=lambda item: item[1])
    ranges: dict[str, tuple[float, float]] = {}

    for index, (column, center) in enumerate(ordered_columns):
        left_boundary = (
            float("-inf")
            if index == 0
            else (ordered_columns[index - 1][1] + center) / 2
        )
        right_boundary = (
            float("inf")
            if index == len(ordered_columns) - 1
            else (center + ordered_columns[index + 1][1]) / 2
        )
        if index == 0 and len(ordered_columns) > 1:
            next_center = ordered_columns[index + 1][1]
            left_boundary = max(left_boundary, center - ((next_center - center) / 2))
        if description_center is not None and description_center < center:
            left_boundary = max(left_boundary, (description_center + center) / 2)
        ranges[column] = (left_boundary, right_boundary)

    return LayoutColumnRanges(
        expense=ranges["expense"],
        income=ranges["income"],
        balance=ranges["balance"],
    )


def _select_movement_header_lines(page_lines: list[LayoutLine]) -> list[LayoutLine]:
    """Conserva solo el encabezado de movimientos y evita el resumen superior."""
    movement_header = next(
        (
            line
            for line in page_lines
            if "DESCRIPCION" in line.text.upper()
            or "DESCRIPCIÓN" in line.text.upper()
            or "DETALLE" in line.text.upper()
            or "OPERACION" in line.text.upper()
            or "OPERACIÓN" in line.text.upper()
            or "COMERCIO" in line.text.upper()
        ),
        None,
    )
    if movement_header is None:
        return page_lines

    return [
        line
        for line in page_lines
        if movement_header.top - 2 <= line.top <= movement_header.top + 16
    ]


def _find_header_center(
    page_lines: list[LayoutLine],
    headers: tuple[str, ...],
) -> float | None:
    """Busca el centro horizontal de un encabezado dentro de lineas posicionadas."""
    centers: list[float] = []
    normalized_headers = {header.upper() for header in headers}

    for line in page_lines:
        upper_text = line.text.upper()
        header_markers = (
            "DESCRIPCION",
            "DESCRIPCIÓN",
            "DETALLE",
            "MOVIMIENTO",
            "OPERACION",
            "OPERACIÓN",
            "CHEQUES",
            "DEPOSITOS",
            "DEPÓSITOS",
            "CARGOS",
            "ABONOS",
            "INGRESO",
            "INGRESOS",
            "EGRESO",
            "EGRESOS",
            "RECARGA",
            "RECARGAS",
            "CONSUMO",
            "CONSUMOS",
            "SALDO",
        )
        if not any(marker in upper_text for marker in header_markers):
            continue
        upper_words = [word.text.upper() for word in line.words]
        if len(normalized_headers) == 1:
            header = next(iter(normalized_headers))
            matching_words = [
                word for word in line.words if word.text.upper() == header
            ]
            if matching_words:
                return max((word.x0 + word.x1) / 2 for word in matching_words)

        for word in line.words:
            if word.text.upper() in normalized_headers:
                centers.append((word.x0 + word.x1) / 2)

        if all(header in upper_words for header in normalized_headers):
            matching_words = [
                word
                for word in line.words
                if word.text.upper() in normalized_headers
            ]
            if matching_words:
                return (
                    min(word.x0 for word in matching_words)
                    + max(word.x1 for word in matching_words)
                ) / 2

    if centers:
        return sum(centers) / len(centers)
    return None


def _parse_tabular_line(
    line: TabularLine,
    profile: TabularParserProfile,
    explicit_period: tuple[datetime, datetime] | None,
    layout_context: dict[str, object],
) -> TransactionCandidate | None:
    """Convierte una linea tabular en candidato de transaccion si corresponde."""
    match = TABULAR_DATE_LINE_PATTERN.match(line.text)
    if match is None:
        return None

    raw_date, _, remainder = match.groups()
    upper_remainder = remainder.upper()
    if upper_remainder.startswith(IGNORED_MOVEMENT_PREFIXES):
        return None

    amount_matches = list(AMOUNT_PATTERN.finditer(remainder))
    if not amount_matches:
        raise PdfImportError("No se detecto un monto interpretable.")

    selected_matches = _select_amount_block(
        remainder,
        amount_matches,
        layout_line=line.layout_line,
        layout_context=layout_context,
    )
    raw_amounts = [amount_match.group(0) for amount_match in selected_matches]
    amounts = [normalize_amount_clp(raw_amount) for raw_amount in raw_amounts]
    description = remainder[: selected_matches[0].start()].strip(" :-")
    if not description:
        raise PdfImportError("No se pudo reconstruir la descripcion.")

    signed_amount = _resolve_tabular_amount(
        description=description,
        raw_amounts=raw_amounts,
        amounts=amounts,
        profile=profile,
        layout_line=line.layout_line,
        layout_context=layout_context,
    )
    cleaned_description = _normalize_profile_description(description, profile)
    normalized_date = raw_date.replace("-", "/")
    if len(normalized_date.split("/")) == 3:
        transaction_date = datetime.strptime(normalized_date, "%d/%m/%Y").date()
    elif explicit_period is not None:
        transaction_date = _infer_date(
            normalized_date,
            explicit_period[0],
            explicit_period[1],
        )
    else:
        raise PdfImportError(
            f"La fecha {raw_date} no incluye anio y la cartola no declara un periodo."
        )
    if explicit_period is not None:
        if not _is_date_within_period_tolerance(transaction_date, explicit_period):
            raise PdfImportError(
                f"La fecha {raw_date} esta fuera del periodo declarado."
            )

    return TransactionCandidate(
        source_line=line.text,
        date=transaction_date,
        description=cleaned_description,
        normalized_description=normalize_description(cleaned_description),
        amount_clp=signed_amount,
        transaction_type=(
            TransactionType.INCOME
            if signed_amount > 0
            else TransactionType.EXPENSE
        ),
    )


def _select_amount_block(
    remainder: str,
    amount_matches: list[re.Match[str]],
    layout_line: LayoutLine | None = None,
    layout_context: dict[str, object] | None = None,
) -> list[re.Match[str]]:
    """Selecciona el bloque de montos relevante al final de una fila."""
    layout_matches = _select_layout_movement_amounts(
        amount_matches,
        layout_line,
        layout_context,
    )
    if layout_matches:
        return layout_matches

    selected = [amount_matches[-1]]
    allowed_separator = re.compile(
        r"^\s*(?:(?:SALDO|CARGO|CARGOS|ABONO|ABONOS|DEBE|HABER)\s*)*$",
        re.IGNORECASE,
    )

    for previous in reversed(amount_matches[:-1]):
        previous_value = previous.group(0).strip()
        selected_value = selected[0].group(0).lstrip().upper()
        if re.fullmatch(r"\d{10,}", previous_value) and selected_value.startswith("CLP"):
            break
        separator = remainder[previous.end() : selected[0].start()]
        if not allowed_separator.fullmatch(separator):
            break
        selected.insert(0, previous)
        if len(selected) == 3:
            break

    return selected


def _select_layout_movement_amounts(
    amount_matches: list[re.Match[str]],
    layout_line: LayoutLine | None,
    layout_context: dict[str, object] | None,
) -> list[re.Match[str]]:
    """Selecciona montos ubicados visualmente en columnas de cargo o abono."""
    if layout_line is None or layout_context is None:
        return []

    column_ranges = _get_layout_column_ranges(layout_line, layout_context)
    if column_ranges is None:
        return []

    selected: list[re.Match[str]] = []
    occurrence_by_amount: dict[tuple[str, int], int] = {}
    for amount_match in amount_matches:
        raw_amount = amount_match.group(0)
        try:
            amount = normalize_amount_clp(raw_amount)
        except ValueError:
            continue

        key = (_normalize_amount_text(raw_amount), abs(amount))
        occurrence = occurrence_by_amount.get(key, 0)
        occurrence_by_amount[key] = occurrence + 1
        amount_word = _find_layout_amount_word_occurrence(
            layout_line,
            amount,
            raw_amount,
            occurrence,
        )
        column = _classify_layout_amount_column(amount_word, column_ranges)
        if column in {"expense", "income"}:
            selected.append(amount_match)

    return selected


def _resolve_tabular_amount(
    *,
    description: str,
    raw_amounts: list[str],
    amounts: list[int],
    profile: TabularParserProfile,
    layout_line: LayoutLine | None,
    layout_context: dict[str, object],
) -> int:
    """Determina el signo final de un monto tabular usando texto y layout."""
    layout_signed_amount = _resolve_layout_column_candidate_amount(
        raw_amounts=raw_amounts,
        amounts=amounts,
        layout_line=layout_line,
        layout_context=layout_context,
    )
    if layout_signed_amount is not None:
        return layout_signed_amount

    has_two_amount_columns = (
        len(amounts) == 2
        and ((amounts[0] == 0) != (amounts[1] == 0))
    )
    transaction_values = (
        amounts
        if len(amounts) == 1 or has_two_amount_columns
        else amounts[:-1]
    )
    transaction_raw_values = (
        raw_amounts
        if len(raw_amounts) == 1 or has_two_amount_columns
        else raw_amounts[:-1]
    )

    for raw_value, value in zip(transaction_raw_values, transaction_values):
        compact = raw_value.replace(" ", "")
        if value < 0 or compact.startswith(("-$", "-CLP", "-")):
            return -abs(value)
        if compact.startswith(("+$", "+CLP", "+", "$+")):
            return abs(value)

    non_zero_values = [abs(value) for value in transaction_values if value != 0]
    if not non_zero_values:
        raise PdfImportError("El movimiento no contiene un monto distinto de cero.")
    if len(non_zero_values) > 1:
        raise PdfImportError(
            "La fila contiene mas de un monto de movimiento y no es posible "
            "determinar cargo o abono."
        )

    upper_description = description.upper()
    if any(keyword in upper_description for keyword in profile.income_keywords):
        return non_zero_values[0]
    if any(keyword in upper_description for keyword in profile.expense_keywords):
        return -non_zero_values[0]

    if len(transaction_values) == 2:
        cargo, abono = transaction_values
        if cargo != 0 and abono == 0:
            return -abs(cargo)
        if abono != 0 and cargo == 0:
            return abs(abono)

    raise PdfImportError(
        "No se pudo determinar si el monto corresponde a un cargo o un abono."
    )


def _resolve_layout_column_candidate_amount(
    *,
    raw_amounts: list[str],
    amounts: list[int],
    layout_line: LayoutLine | None,
    layout_context: dict[str, object],
) -> int | None:
    """Resuelve un monto usando columnas visuales y descarta saldos/ruido."""
    if layout_line is None:
        return None

    column_ranges = _get_layout_column_ranges(layout_line, layout_context)
    if column_ranges is None:
        return None

    normalized_targets = [
        (_normalize_amount_text(raw_amount), abs(amount))
        for raw_amount, amount in zip(raw_amounts, amounts)
        if amount != 0
    ]
    signed_candidates: list[int] = []

    for word in layout_line.words:
        normalized_word = _normalize_amount_text(word.text)
        try:
            word_amount = abs(normalize_amount_clp(word.text))
        except ValueError:
            continue

        if not any(
            normalized_word == target and word_amount == amount
            for target, amount in normalized_targets
        ):
            continue

        column = _classify_layout_amount_column(word, column_ranges)
        if column == "expense":
            signed_candidates.append(-word_amount)
        elif column == "income":
            signed_candidates.append(word_amount)

    unique_candidates = set(signed_candidates)
    if len(unique_candidates) == 1:
        return unique_candidates.pop()
    return None


def _get_layout_column_ranges(
    layout_line: LayoutLine,
    layout_context: dict[str, object],
) -> LayoutColumnRanges | None:
    """Obtiene los rangos de columnas calculados para la pagina de la fila."""
    column_ranges_by_page = layout_context["column_ranges_by_page"]
    if not isinstance(column_ranges_by_page, dict):
        return None
    column_ranges = column_ranges_by_page.get(layout_line.page_index)
    if not isinstance(column_ranges, LayoutColumnRanges):
        return None
    return column_ranges


def _classify_layout_amount_column(
    amount_word: LayoutWord | None,
    column_ranges: LayoutColumnRanges,
) -> str | None:
    """Clasifica una palabra del PDF como cargo, abono, saldo o descripcion."""
    if amount_word is None:
        return None

    amount_center = (amount_word.x0 + amount_word.x1) / 2
    if column_ranges.expense[0] <= amount_center < column_ranges.expense[1]:
        return "expense"
    if column_ranges.income[0] <= amount_center < column_ranges.income[1]:
        return "income"
    if column_ranges.balance[0] <= amount_center < column_ranges.balance[1]:
        return "balance"
    return None


def _find_layout_amount_word_occurrence(
    layout_line: LayoutLine,
    amount: int,
    raw_amount: str,
    occurrence: int,
) -> LayoutWord | None:
    """Ubica una ocurrencia visual de un monto textual repetido."""
    normalized_target = _normalize_amount_text(raw_amount)
    matching_words: list[LayoutWord] = []
    for word in layout_line.words:
        if _normalize_amount_text(word.text) != normalized_target:
            continue
        try:
            if abs(normalize_amount_clp(word.text)) == abs(amount):
                matching_words.append(word)
        except ValueError:
            continue

    if not matching_words:
        return None
    matching_words.sort(key=lambda word: word.x0)
    if occurrence < len(matching_words):
        return matching_words[occurrence]
    return matching_words[-1]


def _normalize_amount_text(value: str) -> str:
    """Normaliza textos de monto antes de comparar parser y palabras del PDF."""
    return (
        value.replace("$", "")
        .replace("CLP", "")
        .replace("clp", "")
        .replace(" ", "")
        .lstrip("+-")
    )


def _normalize_profile_description(
    description: str,
    profile: TabularParserProfile,
) -> str:
    """Aplica la limpieza de descripcion propia del banco cuando exista."""
    if profile.description_normalizer is None:
        return description

    cleaned_description = profile.description_normalizer(description).strip(" :-")
    return cleaned_description or description


def _normalize_santander_description(description: str) -> str:
    """Limpia prefijos estructurales de Santander sin borrar numeros utiles."""
    cleaned_description = re.sub(
        SANTANDER_TRANSFER_PREFIX_PATTERN,
        "",
        description,
        count=1,
    )
    cleaned_description = re.sub(
        SANTANDER_CARD_PREFIX_PATTERN,
        "",
        cleaned_description,
        count=1,
    )
    cleaned_description = re.sub(
        SANTANDER_OPERATION_BRANCH_PREFIX_PATTERN,
        "",
        cleaned_description,
        count=1,
    )
    return re.sub(r"\s+", " ", cleaned_description).strip()


def _normalize_mercadopago_description(description: str) -> str:
    """Retira el tipo de movimiento y el ID estructural de Mercado Pago."""
    cleaned_description = re.sub(r"\s+\d{10,}\s*$", "", description)
    cleaned_description = re.sub(
        r"^\s*(?:CARGO|ABONO)\s+",
        "",
        cleaned_description,
        count=1,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", cleaned_description).strip()


def _extract_optional_period(
    extracted_text: str,
    profile: TabularParserProfile,
) -> tuple[datetime, datetime] | None:
    """Extrae el periodo declarado en una cartola si el texto lo incluye."""
    for pattern in profile.period_patterns:
        match = pattern.search(extracted_text)
        if match is None:
            continue
        period = (
            _parse_full_date(match.group(1)),
            _parse_full_date(match.group(2)),
        )
        if period[1] < period[0]:
            raise PdfImportError(
                "La fecha final del periodo es anterior a la fecha inicial."
            )
        return period
    return None


def _parse_full_date(raw_date: str) -> datetime:
    """Parsea una fecha completa aceptando guiones o barras."""
    return datetime.strptime(raw_date.replace("-", "/"), "%d/%m/%Y")


def _is_date_within_period_tolerance(
    transaction_date: date,
    explicit_period: tuple[datetime, datetime],
) -> bool:
    """Verifica si una fecha cae dentro del periodo con tolerancia de un dia."""
    period_start, period_end = (value.date() for value in explicit_period)
    if period_start <= transaction_date <= period_end:
        return True
    return min(
        abs(transaction_date - period_start),
        abs(transaction_date - period_end),
    ) <= timedelta(days=1)


def _infer_date(raw_date: str, period_start: datetime, period_end: datetime) -> date:
    """Infiere el anio de una fecha dia/mes usando el periodo de la cartola."""
    day, month = (int(part) for part in raw_date.split("/"))
    years = sorted(
        {period_start.year - 1, period_start.year, period_end.year, period_end.year + 1}
    )
    candidates = []
    for year in years:
        try:
            candidate = datetime(year, month, day)
        except ValueError as error:
            raise PdfImportError(f"Fecha invalida: {raw_date}") from error
        if period_start <= candidate <= period_end:
            candidates.append(candidate)
    if candidates:
        return candidates[0].date()

    nearest = min(
        (datetime(year, month, day) for year in years),
        key=lambda value: min(abs(value - period_start), abs(value - period_end)),
    )
    if min(abs(nearest - period_start), abs(nearest - period_end)) <= timedelta(days=1):
        return nearest.date()
    raise PdfImportError(f"No se pudo inferir el anio de la fecha {raw_date}.")


def _extract_santander_summary_totals(
    extracted_text: str,
) -> tuple[int, int] | None:
    """Extrae cargos y abonos totales del resumen de Banco Santander."""
    match = re.search(
        r"SALDO\s+INICIAL\s+CHEQUES\s+O\s+CARGOS\s+"
        r"DEP[OÓ]SITOS\s+O\s+ABONOS\s+SALDO\s+FINAL\s+"
        r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)",
        extracted_text,
        re.IGNORECASE,
    )
    if match is None:
        return None
    return (
        abs(normalize_amount_clp(match.group(2))),
        abs(normalize_amount_clp(match.group(3))),
    )


def _extract_copecpay_summary_totals(
    extracted_text: str,
) -> tuple[int, int] | None:
    """Extrae cargos y abonos totales del resumen final de CopecPay."""
    match = re.search(
        r"TOTAL\s+CARGOS\s+TOTAL\s+ABONOS\s+SALDO\s+FINAL\s+"
        r"(\$?\s*[\d.]+)\s+(\$?\s*[\d.]+)\s+(\$?\s*[\d.]+)",
        extracted_text,
        re.IGNORECASE,
    )
    if match is None:
        return None
    return (
        abs(normalize_amount_clp(match.group(1))),
        abs(normalize_amount_clp(match.group(2))),
    )


def _validate_summary_totals(
    extracted_text: str,
    candidates: list[TransactionCandidate],
    profile: TabularParserProfile,
) -> None:
    """Compara los totales parseados contra el resumen declarado por el banco."""
    if profile.summary_totals_extractor is None:
        return

    expected_totals = profile.summary_totals_extractor(extracted_text)
    if expected_totals is None:
        return

    expected_expenses, expected_income = expected_totals
    parsed_expenses = sum(
        abs(candidate.amount_clp)
        for candidate in candidates
        if candidate.amount_clp < 0
    )
    parsed_income = sum(
        candidate.amount_clp
        for candidate in candidates
        if candidate.amount_clp > 0
    )
    if (parsed_expenses, parsed_income) != expected_totals:
        raise PdfImportError(
            f"Los movimientos detectados en {profile.display_name} no cuadran con "
            "el resumen de la cartola: "
            f"cargos {parsed_expenses}/{expected_expenses}, "
            f"abonos {parsed_income}/{expected_income}."
        )


BANCO_CHILE_PROFILE = TabularParserProfile(
    display_name="Banco de Chile",
    document_markers=("BANCO DE CHILE", "BANCOCHILE"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "TRASPASO DE:",
        "ABONO",
        "DEPOSITO",
        "PAGO:DE HONORARIOS",
    ),
    expense_keywords=(
        "TRASPASO A:",
        "PAGO:",
        "COMPRA",
        "GIRO",
        "CARGO",
        "COMISION",
    ),
)
SANTANDER_PROFILE = TabularParserProfile(
    display_name="Banco Santander",
    document_markers=("BANCO SANTANDER", "SANTANDER CHILE", "SANTANDER"),
    period_patterns=(
        *STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
        *SANTANDER_POSITIONAL_PERIOD_PATTERNS,
    ),
    income_keywords=(
        "ABONO",
        "DEPOSITO",
        "TRANSFERENCIA RECIBIDA",
        "TRASPASO RECIBIDO",
        "REMUNERACION",
        "PAGO RECIBIDO",
        "TRANSF.",
    ),
    expense_keywords=(
        "CARGO",
        "COMPRA",
        "PAGO",
        "GIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "TRANSF A ",
        "PAC",
        "PAT",
    ),
    continuation_lines=True,
    movement_start_markers=("CARGOS ABONOS", "CARGO ABONO"),
    movement_end_markers=("MENSAJES", "RESUMEN DE COMISIONES"),
    summary_totals_extractor=_extract_santander_summary_totals,
    layout_columns=LayoutColumnProfile(
        expense_headers=("CHEQUES", "CARGOS"),
        income_headers=("DEPOSITOS", "DEPÓSITOS", "ABONOS"),
        balance_headers=("SALDO",),
    ),
    description_normalizer=_normalize_santander_description,
)
COPECPAY_PROFILE = TabularParserProfile(
    display_name="CopecPay",
    document_markers=("COPECPAY", "COPEC PAY"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "RECARGA",
        "CARGA",
        "ABONO",
        "DEVOLUCION",
        "REEMBOLSO",
        "TRANSFERENCIA RECIBIDA",
        "GANANCIA",
        "TRANSFERENCIA DE",
    ),
    expense_keywords=(
        "COMPRA",
        "CONSUMO",
        "PAGO",
        "RETIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "TRANSFERENCIA A",
    ),
    movement_start_markers=("FECHA DESCRIPCI",),
    movement_end_markers=("TOTAL CARGOS TOTAL ABONOS SALDO FINAL",),
    summary_totals_extractor=_extract_copecpay_summary_totals,
    layout_columns=LayoutColumnProfile(
        expense_headers=("CARGOS", "CARGO"),
        income_headers=("ABONOS", "ABONO"),
        balance_headers=("SALDO",),
        description_headers=(
            "DESCRIPCION",
            "DESCRIPCIÓN",
        ),
    ),
)
MERCADOPAGO_PROFILE = TabularParserProfile(
    display_name="Mercado Pago",
    document_markers=("MERCADO PAGO", "MERCADOPAGO"),
    period_patterns=(
        *STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
        *MERCADOPAGO_POSITIONAL_PERIOD_PATTERNS,
    ),
    income_keywords=(
        "ABONO",
        "DINERO RECIBIDO",
        "PAGO RECIBIDO",
        "COBRO",
        "VENTA",
        "INGRESO",
        "DEVOLUCION",
        "RENDIMIENTO",
    ),
    expense_keywords=(
        "COMPRA",
        "PAGO",
        "RETIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "DINERO ENVIADO",
        "CARGO",
    ),
    movement_start_markers=("FECHA DE ACREDITACI",),
    description_normalizer=_normalize_mercadopago_description,
    layout_columns=LayoutColumnProfile(
        expense_headers=("EGRESO", "EGRESOS", "CARGO", "CARGOS"),
        income_headers=("INGRESO", "INGRESOS", "ABONO", "ABONOS"),
        balance_headers=("SALDO",),
        description_headers=(
            "DESCRIPCION",
            "DESCRIPCIÓN",
            "DETALLE",
            "MOVIMIENTO",
            "OPERACION",
            "OPERACIÓN",
        ),
    ),
)
BANCO_ESTADO_PROFILE = TabularParserProfile(
    display_name="BancoEstado",
    document_markers=("BANCOESTADO", "BANCO ESTADO", "CUENTARUT"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "ABONO",
        "DEPOSITO",
        "TRANSFERENCIA RECIBIDA",
        "REMUNERACION",
        "PAGO RECIBIDO",
    ),
    expense_keywords=(
        "CARGO",
        "COMPRA",
        "PAGO",
        "GIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "PAC",
    ),
)

PARSER_PROFILES: dict[ParserKey, TabularParserProfile] = {
    ParserKey.BANCO_DE_CHILE: BANCO_CHILE_PROFILE,
    ParserKey.BANCO_SANTANDER: SANTANDER_PROFILE,
    ParserKey.COPECPAY: COPECPAY_PROFILE,
    ParserKey.MERCADOPAGO: MERCADOPAGO_PROFILE,
    ParserKey.BANCO_ESTADO: BANCO_ESTADO_PROFILE,
}

PDF_DOCUMENT_VALIDATORS: dict[ParserKey, DocumentValidator] = {
    parser_key: _build_institution_validator(profile)
    for parser_key, profile in PARSER_PROFILES.items()
}

PDF_PARSERS: dict[ParserKey, ParserHandler] = {
    parser_key: partial(_parse_tabular_document, profile=profile)
    for parser_key, profile in PARSER_PROFILES.items()
}
