from __future__ import annotations

from enum import StrEnum


class CurrencyCode(StrEnum):
    CLP = "CLP"


class InstitutionCode(StrEnum):
    BANCO_DE_CHILE = "banco_de_chile"
    BANCO_SANTANDER = "banco_santander"
    COPECPAY = "copecpay"
    MERCADOPAGO = "mercadopago"
    BANCO_ESTADO = "banco_estado"
    BANCO_FALABELLA = "banco_falabella"


class StatementStatus(StrEnum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"


class CategoryType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class CategorySource(StrEnum):
    RULE = "rule"
    MANUAL = "manual"
    DEFAULT = "default"
