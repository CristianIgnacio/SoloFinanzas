from __future__ import annotations

from enum import StrEnum

from app.domain.enums import InstitutionCode


class ParserKey(StrEnum):
    BANCO_DE_CHILE = "banco_de_chile"
    BANCO_SANTANDER = "banco_santander"
    COPECPAY = "copecpay"
    MERCADOPAGO = "mercadopago"
    BANCO_ESTADO = "banco_estado"


INSTITUTION_PARSER_MAP: dict[InstitutionCode, ParserKey] = {
    InstitutionCode.BANCO_DE_CHILE: ParserKey.BANCO_DE_CHILE,
    InstitutionCode.BANCO_SANTANDER: ParserKey.BANCO_SANTANDER,
    InstitutionCode.COPECPAY: ParserKey.COPECPAY,
    InstitutionCode.MERCADOPAGO: ParserKey.MERCADOPAGO,
    InstitutionCode.BANCO_ESTADO: ParserKey.BANCO_ESTADO,
}


def get_parser_for_institution(institution: InstitutionCode) -> ParserKey:
    """Obtiene la clave de parser PDF configurada para una institucion."""
    try:
        return INSTITUTION_PARSER_MAP[institution]
    except KeyError as error:
        raise ValueError(
            f"No existe un parser PDF configurado para la institucion {institution.value}."
        ) from error
