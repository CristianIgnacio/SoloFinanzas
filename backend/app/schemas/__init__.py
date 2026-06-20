"""Shared SQLModel schemas."""

from app.domain.enums import (
    CategorySource,
    CategoryType,
    CurrencyCode,
    InstitutionCode,
    StatementStatus,
    TransactionType,
)
from app.schemas.account import Account, AccountCreate, AccountUpdate
from app.schemas.categorization_rule import (
    CategorizationRule,
    CategorizationRuleCreate,
    CategorizationRuleSeed,
)
from app.schemas.category import Category, CategoryCreate
from app.schemas.dashboard import DashboardResponse, MonthlyMovement, SummaryCard
from app.schemas.shared import ImportTransactionsResult
from app.schemas.statement import Statement, StatementCreate
from app.schemas.transaction import Transaction, TransactionCandidate, TransactionCreate

__all__ = [
    "Account",
    "AccountCreate",
    "AccountUpdate",
    "CategorizationRule",
    "CategorizationRuleCreate",
    "CategorizationRuleSeed",
    "Category",
    "CategoryCreate",
    "CategorySource",
    "CategoryType",
    "CurrencyCode",
    "DashboardResponse",
    "ImportTransactionsResult",
    "InstitutionCode",
    "MonthlyMovement",
    "Statement",
    "StatementCreate",
    "StatementStatus",
    "SummaryCard",
    "Transaction",
    "TransactionCandidate",
    "TransactionCreate",
    "TransactionType",
]
