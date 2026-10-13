from __future__ import annotations

import re
from functools import partial
from app.domain.enums import InstitutionCode
from app.domain.parsers import ParserKey, get_parser_for_institution
from .models import (PdfImportError, ParserResult, ParserHandler, DocumentValidator, LayoutLine, LayoutVerticalEdge, TabularParserProfile)
from .tabular import (_build_institution_validator, _normalize_document_marker, _document_marker_variants, _extract_optional_period, _parse_tabular_document)
from .institutions.banco_chile import BANCO_CHILE_PROFILE
from .institutions.banco_chile_credit_national import (
    parse_banco_chile_credit_national,
    validate_banco_chile_credit_national,
)
from .institutions.santander import SANTANDER_PROFILE
from .institutions.copecpay import COPECPAY_PROFILE
from .institutions.mercadopago import MERCADOPAGO_PROFILE
from .institutions.banco_estado import BANCO_ESTADO_PROFILE
from .institutions.falabella import FALABELLA_PROFILE
from .institutions.falabella_cmr_national import (
    parse_falabella_cmr_national,
    validate_falabella_cmr_national,
)
from .institutions.santander_credit_national import (
    parse_santander_credit_national,
    validate_santander_credit_national,
)

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
    vertical_edges: tuple[LayoutVerticalEdge, ...] = (),
    validation_warnings: list[str] | None = None,
) -> ParserResult:
    """Despacha el texto extraido al parser registrado para la institucion."""
    try:
        parser = PDF_PARSERS[parser_key]
    except KeyError as error:
        raise PdfImportError(
            f"El parser {parser_key.value} no tiene una implementacion configurada."
        ) from error
    parser_options = {"layout_lines": layout_lines, "vertical_edges": vertical_edges}
    if validation_warnings is not None:
        parser_options["validation_warnings"] = validation_warnings
    return parser(extracted_text, **parser_options)


def _validate_falabella_document(extracted_text: str) -> None:
    """Reconoce la estructura de cuenta corriente: el logo puede ser una imagen."""
    required_headers = (
        r"^\s*Cartola de Movimientos\s*$",
        r"^\s*Cuenta Corriente\s*$",
        r"^\s*Saldo Disponible\s+\$",
        r"^\s*Saldo Contable\s+\$",
        r"^\s*Listado de movimientos\s*$",
        r"^\s*FECHA\s+DESCRIPCI[OÓ]N\s+CARGO\s+ABONO\s+SALDO\s*$",
    )
    header_text = re.split(
        r"Listado de movimientos", extracted_text, maxsplit=1, flags=re.IGNORECASE
    )[0]
    normalized_header_lines = [
        _normalize_document_marker(line) for line in header_text.splitlines()
    ]
    other_institution = any(
        line.startswith(variant)
        for parser_key, profile in PARSER_PROFILES.items()
        if parser_key != ParserKey.BANCO_FALABELLA
        for marker in profile.document_markers
        for variant in _document_marker_variants(marker)
        for line in normalized_header_lines
    )
    if (
        other_institution
        or not all(
            re.search(pattern, extracted_text, re.IGNORECASE | re.MULTILINE)
            for pattern in required_headers
        )
        or _extract_optional_period(extracted_text, FALABELLA_PROFILE) is None
    ):
        raise PdfImportError(
            "El PDF no corresponde al formato compatible de Banco Falabella: "
            "Cartola de Movimientos de Cuenta Corriente. "
            "Los estados de cuenta CMR aun no estan soportados."
        )


PARSER_PROFILES: dict[ParserKey, TabularParserProfile] = {
    ParserKey.BANCO_DE_CHILE: BANCO_CHILE_PROFILE,
    ParserKey.BANCO_SANTANDER: SANTANDER_PROFILE,
    ParserKey.COPECPAY: COPECPAY_PROFILE,
    ParserKey.MERCADOPAGO: MERCADOPAGO_PROFILE,
    ParserKey.BANCO_ESTADO: BANCO_ESTADO_PROFILE,
    ParserKey.BANCO_FALABELLA: FALABELLA_PROFILE,
}

PDF_DOCUMENT_VALIDATORS: dict[ParserKey, DocumentValidator] = {
    parser_key: _build_institution_validator(profile)
    for parser_key, profile in PARSER_PROFILES.items()
}
PDF_DOCUMENT_VALIDATORS[ParserKey.BANCO_FALABELLA] = _validate_falabella_document
PDF_DOCUMENT_VALIDATORS[ParserKey.BANCO_CHILE_CREDIT_NATIONAL] = validate_banco_chile_credit_national
PDF_DOCUMENT_VALIDATORS[ParserKey.SANTANDER_CREDIT_NATIONAL] = validate_santander_credit_national
PDF_DOCUMENT_VALIDATORS[ParserKey.FALABELLA_CMR_NATIONAL] = validate_falabella_cmr_national

PDF_PARSERS: dict[ParserKey, ParserHandler] = {
    parser_key: partial(_parse_tabular_document, profile=profile)
    for parser_key, profile in PARSER_PROFILES.items()
}
PDF_PARSERS[ParserKey.SANTANDER_CREDIT_NATIONAL] = parse_santander_credit_national
PDF_PARSERS[ParserKey.BANCO_CHILE_CREDIT_NATIONAL] = parse_banco_chile_credit_national
PDF_PARSERS[ParserKey.FALABELLA_CMR_NATIONAL] = parse_falabella_cmr_national
