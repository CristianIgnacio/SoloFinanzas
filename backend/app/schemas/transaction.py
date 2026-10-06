from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlmodel import SQLModel

from app.domain.enums import CategorySource, TransactionType


class TransactionCandidate(SQLModel):
    source_id: str | None = None
    source_line: str
    date: date
    description: str
    normalized_description: str
    amount_clp: int
    transaction_type: TransactionType


class TransactionPreviewCandidate(TransactionCandidate):
    suggested_category_id: int | None = None
    category_source: CategorySource | None = None
    rule_id_applied: int | None = None


class TransactionCandidateReview(SQLModel):
    source_id: str | None = None
    source_line: str
    transaction_type: TransactionType
    category_id: int | None = None


class TransactionBase(SQLModel):
    account_id: int
    statement_id: int
    source_row: int | None = None
    date: date
    description: str
    normalized_description: str
    amount_clp: int
    transaction_type: TransactionType
    category_id: int | None = None
    category_source: CategorySource | None = None
    rule_id_applied: int | None = None
    fingerprint: str | None = None
    raw_data: dict[str, Any] | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionCategoryUpdate(SQLModel):
    category_id: int | None
    category_source: CategorySource | None = None


class Transaction(TransactionBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None
    is_internal_transfer: bool = False
