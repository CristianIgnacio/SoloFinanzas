"""Shared domain primitives."""

from app.domain.enums import (
    CategorySource,
    CategoryType,
    CurrencyCode,
    InstitutionCode,
    StatementStatus,
    TransactionType,
)
from app.domain.parsers import INSTITUTION_PARSER_MAP, ParserKey, get_parser_for_institution
from app.domain.account_products import (
    FINANCIAL_PRODUCTS,
    FinancialProduct,
    PdfSupport,
    ProductKind,
    get_financial_product,
    kind_for_account_type,
    list_financial_products,
    resolve_pdf_parser,
)

__all__ = [
    "CategorySource",
    "CategoryType",
    "CurrencyCode",
    "FINANCIAL_PRODUCTS",
    "FinancialProduct",
    "INSTITUTION_PARSER_MAP",
    "InstitutionCode",
    "ParserKey",
    "PdfSupport",
    "ProductKind",
    "StatementStatus",
    "TransactionType",
    "get_parser_for_institution",
    "get_financial_product",
    "kind_for_account_type",
    "list_financial_products",
    "resolve_pdf_parser",
]
