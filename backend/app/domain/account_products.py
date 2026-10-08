"""Catálogo de productos y política de importación PDF por cuenta."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
import unicodedata

from app.domain.enums import InstitutionCode
from app.domain.parsers import ParserKey, get_parser_for_institution


class ProductKind(StrEnum):
    CURRENT = "corriente"
    SIGHT = "vista"
    SAVINGS = "ahorro"
    PREPAID_WALLET = "billetera_prepago"
    CREDIT = "credito"


class PdfSupport(StrEnum):
    SAMPLE_TESTED = "muestra_probada"
    NOT_VERIFIED = "pendiente_verificacion"
    UNSUPPORTED = "no_soportado"


@dataclass(frozen=True, slots=True)
class FinancialProduct:
    code: str
    institution: InstitutionCode
    name: str
    kind: ProductKind
    pdf_support: PdfSupport
    parser_key: ParserKey | None = None


FINANCIAL_PRODUCTS: tuple[FinancialProduct, ...] = (
    FinancialProduct(
        "banco_de_chile_cuenta_fan", InstitutionCode.BANCO_DE_CHILE,
        "Cuenta FAN", ProductKind.SIGHT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_de_chile_corriente_digital", InstitutionCode.BANCO_DE_CHILE,
        "Cuenta Corriente Digital", ProductKind.CURRENT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_de_chile_corriente_tradicional", InstitutionCode.BANCO_DE_CHILE,
        "Cuenta Corriente (plan tradicional)", ProductKind.CURRENT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_de_chile_fan_ahorro", InstitutionCode.BANCO_DE_CHILE,
        "FAN Ahorro", ProductKind.SAVINGS, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_de_chile_visa_signature", InstitutionCode.BANCO_DE_CHILE,
        "Visa Signature", ProductKind.CREDIT, PdfSupport.UNSUPPORTED,
    ),
    FinancialProduct(
        "banco_de_chile_visa_infinite", InstitutionCode.BANCO_DE_CHILE,
        "Visa Infinite", ProductKind.CREDIT, PdfSupport.UNSUPPORTED,
    ),
    FinancialProduct(
        "banco_santander_mas_lucas", InstitutionCode.BANCO_SANTANDER,
        "Cuenta Vista Más Lucas", ProductKind.SIGHT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_santander_corriente_digital", InstitutionCode.BANCO_SANTANDER,
        "Cuenta Corriente Digital", ProductKind.CURRENT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_santander_ahorro", InstitutionCode.BANCO_SANTANDER,
        "Cuenta de Ahorro", ProductKind.SAVINGS, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_santander_platinum_latam_pass", InstitutionCode.BANCO_SANTANDER,
        "Platinum Santander LATAM Pass", ProductKind.CREDIT, PdfSupport.UNSUPPORTED,
    ),
    FinancialProduct(
        "banco_estado_cuenta_rut", InstitutionCode.BANCO_ESTADO,
        "CuentaRUT", ProductKind.SIGHT, PdfSupport.SAMPLE_TESTED,
        ParserKey.BANCO_ESTADO,
    ),
    FinancialProduct(
        "banco_estado_cuenta_pro", InstitutionCode.BANCO_ESTADO,
        "Cuenta Pro (Chequera Electrónica)", ProductKind.SIGHT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_estado_corriente_digital", InstitutionCode.BANCO_ESTADO,
        "Cuenta Corriente Digital", ProductKind.CURRENT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_estado_visa_smart", InstitutionCode.BANCO_ESTADO,
        "Visa SMART", ProductKind.CREDIT, PdfSupport.UNSUPPORTED,
    ),
    FinancialProduct(
        "banco_falabella_corriente", InstitutionCode.BANCO_FALABELLA,
        "Cuenta Corriente", ProductKind.CURRENT, PdfSupport.SAMPLE_TESTED,
        ParserKey.BANCO_FALABELLA,
    ),
    FinancialProduct(
        "banco_falabella_vista", InstitutionCode.BANCO_FALABELLA,
        "Cuenta Vista", ProductKind.SIGHT, PdfSupport.NOT_VERIFIED,
    ),
    FinancialProduct(
        "banco_falabella_cmr_mastercard", InstitutionCode.BANCO_FALABELLA,
        "CMR Mastercard", ProductKind.CREDIT, PdfSupport.UNSUPPORTED,
    ),
    FinancialProduct(
        "mercadopago_cuenta", InstitutionCode.MERCADOPAGO,
        "Cuenta Mercado Pago", ProductKind.PREPAID_WALLET,
        PdfSupport.SAMPLE_TESTED, ParserKey.MERCADOPAGO,
    ),
    FinancialProduct(
        "copecpay_cuenta_digital", InstitutionCode.COPECPAY,
        "Cuenta Digital Copec Pay", ProductKind.PREPAID_WALLET,
        PdfSupport.SAMPLE_TESTED, ParserKey.COPECPAY,
    ),
)

if len({product.code for product in FINANCIAL_PRODUCTS}) != len(FINANCIAL_PRODUCTS):
    raise ValueError("Los codigos del catalogo de productos deben ser unicos.")
for product in FINANCIAL_PRODUCTS:
    expected_parser = (
        get_parser_for_institution(product.institution)
        if product.pdf_support == PdfSupport.SAMPLE_TESTED else None
    )
    if product.parser_key != expected_parser:
        raise ValueError(f"Perfil PDF inconsistente para {product.code}.")
    if product.kind == ProductKind.CREDIT and product.pdf_support != PdfSupport.UNSUPPORTED:
        raise ValueError(f"El credito no tiene importador PDF: {product.code}.")

FINANCIAL_PRODUCTS_BY_CODE = MappingProxyType(
    {product.code: product for product in FINANCIAL_PRODUCTS}
)


def get_financial_product(code: str) -> FinancialProduct | None:
    return FINANCIAL_PRODUCTS_BY_CODE.get(code)


def list_financial_products(
    institution: InstitutionCode | None = None,
    kind: ProductKind | None = None,
) -> tuple[FinancialProduct, ...]:
    return tuple(
        product
        for product in FINANCIAL_PRODUCTS
        if (institution is None or product.institution == institution)
        and (kind is None or product.kind == kind)
    )


def kind_for_account_type(value: str) -> ProductKind | None:
    """Reconoce tipos heredados sin confundir 'debito' con un producto."""
    plain = "".join(
        char for char in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(char)
    )
    normalized = " ".join(plain.replace("_", " ").split())
    aliases = {
        "corriente": ProductKind.CURRENT,
        "cuenta corriente": ProductKind.CURRENT,
        "vista": ProductKind.SIGHT,
        "cuenta vista": ProductKind.SIGHT,
        "ahorro": ProductKind.SAVINGS,
        "cuenta de ahorro": ProductKind.SAVINGS,
        "billetera prepago": ProductKind.PREPAID_WALLET,
        "billetera digital": ProductKind.PREPAID_WALLET,
        "prepago": ProductKind.PREPAID_WALLET,
        "cuenta prepago": ProductKind.PREPAID_WALLET,
        "tarjeta de prepago": ProductKind.PREPAID_WALLET,
        "credito": ProductKind.CREDIT,
        "tarjeta de credito": ProductKind.CREDIT,
    }
    return aliases.get(normalized)


def resolve_pdf_parser(
    institution: InstitutionCode, account_type: str, product_code: str | None,
) -> ParserKey:
    """Valida el producto antes de escoger el parser; conserva cuentas heredadas."""
    account_kind = kind_for_account_type(account_type)
    if account_kind == ProductKind.CREDIT:
        raise ValueError("La importación PDF de productos de crédito aún no está disponible.")
    if product_code is None:
        return get_parser_for_institution(institution)

    product = get_financial_product(product_code)
    if product is None:
        raise ValueError("El producto de esta cuenta no existe en el catálogo. Edita la cuenta antes de importar.")
    if product.institution != institution or product.kind != account_kind:
        raise ValueError("El producto de esta cuenta no coincide con su institución o tipo. Edita la cuenta antes de importar.")
    if product.pdf_support == PdfSupport.UNSUPPORTED:
        raise ValueError(f"La importación PDF no está disponible para {product.name}.")
    if product.pdf_support == PdfSupport.NOT_VERIFIED:
        return get_parser_for_institution(institution)
    if product.parser_key is None:
        raise ValueError(f"No hay un parser PDF configurado para {product.name}.")
    return product.parser_key
