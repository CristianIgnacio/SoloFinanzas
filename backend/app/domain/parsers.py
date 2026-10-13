from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.domain.enums import InstitutionCode
from app.domain.product_types import ProductKind


class ParserKey(StrEnum):
    BANCO_DE_CHILE = "banco_de_chile"
    BANCO_CHILE_CREDIT_NATIONAL = "banco_chile_credit_national"
    BANCO_SANTANDER = "banco_santander"
    SANTANDER_CREDIT_NATIONAL = "santander_credit_national"
    COPECPAY = "copecpay"
    MERCADOPAGO = "mercadopago"
    BANCO_ESTADO = "banco_estado"
    BANCO_FALABELLA = "banco_falabella"
    FALABELLA_CMR_NATIONAL = "falabella_cmr_national"


class DocumentKind(StrEnum):
    ACCOUNT_MOVEMENTS = "movimientos_cuenta"
    CREDIT_NATIONAL = "estado_credito_nacional"
    CREDIT_INTERNATIONAL = "estado_credito_internacional"


@dataclass(frozen=True, slots=True)
class ParserDefinition:
    key: ParserKey
    institution: InstitutionCode
    product_kinds: tuple[ProductKind, ...]
    document_kind: DocumentKind


INSTITUTION_PARSER_MAP: dict[InstitutionCode, ParserKey] = {
    InstitutionCode.BANCO_DE_CHILE: ParserKey.BANCO_DE_CHILE,
    InstitutionCode.BANCO_SANTANDER: ParserKey.BANCO_SANTANDER,
    InstitutionCode.COPECPAY: ParserKey.COPECPAY,
    InstitutionCode.MERCADOPAGO: ParserKey.MERCADOPAGO,
    InstitutionCode.BANCO_ESTADO: ParserKey.BANCO_ESTADO,
    InstitutionCode.BANCO_FALABELLA: ParserKey.BANCO_FALABELLA,
}

# Account movements and national credit statements have separate parsers.
PARSER_DEFINITIONS: tuple[ParserDefinition, ...] = tuple(
    ParserDefinition(
        key=key,
        institution=institution,
        product_kinds=(
            ProductKind.CURRENT,
            ProductKind.SIGHT,
            ProductKind.SAVINGS,
            ProductKind.PREPAID_WALLET,
        ),
        document_kind=DocumentKind.ACCOUNT_MOVEMENTS,
    )
    for institution, key in INSTITUTION_PARSER_MAP.items()
) + (
    ParserDefinition(
        key=ParserKey.BANCO_CHILE_CREDIT_NATIONAL,
        institution=InstitutionCode.BANCO_DE_CHILE,
        product_kinds=(ProductKind.CREDIT,),
        document_kind=DocumentKind.CREDIT_NATIONAL,
    ),
    ParserDefinition(
        key=ParserKey.SANTANDER_CREDIT_NATIONAL,
        institution=InstitutionCode.BANCO_SANTANDER,
        product_kinds=(ProductKind.CREDIT,),
        document_kind=DocumentKind.CREDIT_NATIONAL,
    ),
    ParserDefinition(
        key=ParserKey.FALABELLA_CMR_NATIONAL,
        institution=InstitutionCode.BANCO_FALABELLA,
        product_kinds=(ProductKind.CREDIT,),
        document_kind=DocumentKind.CREDIT_NATIONAL,
    ),
)


def get_parsers_for_product_kind(
    institution: InstitutionCode, kind: ProductKind | None,
) -> tuple[ParserKey, ...]:
    """Return compatible document parsers for a bank and product category."""
    if kind is None:
        return ()
    return tuple(
        definition.key
        for definition in PARSER_DEFINITIONS
        if definition.institution == institution and kind in definition.product_kinds
    )


def get_parser_for_institution(institution: InstitutionCode) -> ParserKey:
    """Obtiene la clave de parser PDF configurada para una institucion."""
    try:
        return INSTITUTION_PARSER_MAP[institution]
    except KeyError as error:
        raise ValueError(
            f"No existe un parser PDF configurado para la institucion {institution.value}."
        ) from error
