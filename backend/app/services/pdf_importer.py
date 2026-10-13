"""Stable import path for PDF statement operations and legacy test helpers."""

from app.services.parsing.extractor import _build_preview_lines, _build_reader
from app.services.parsing.models import (
    LayoutLine,
    LayoutVerticalEdge,
    LayoutWord,
    PdfImportError,
)
from app.services.parsing.pipeline import (
    MAX_PDF_SIZE_BYTES,
    RAW_DIR,
    inspect_pdf,
    save_raw_pdf,
)
from app.services.parsing.registry import (
    PARSER_PROFILES,
    PDF_DOCUMENT_VALIDATORS,
    PDF_PARSERS,
    SANTANDER_PROFILE,
    _parse_document,
    _resolve_parser,
    _validate_document,
)
from app.services.parsing.tabular import (
    _build_column_ranges_by_page,
    _extract_optional_period,
)
