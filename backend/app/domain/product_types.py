"""Stable categories shared by the product catalog and PDF routing."""

from enum import StrEnum


class ProductKind(StrEnum):
    CURRENT = "corriente"
    SIGHT = "vista"
    SAVINGS = "ahorro"
    PREPAID_WALLET = "billetera_prepago"
    CREDIT = "credito"
