from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlmodel import Field, SQLModel

from app.domain.enums import CategorySource, TransactionOrigin, TransactionType


class TransactionCandidate(SQLModel):
    source_id: str | None = None
    source_line: str
    date: date
    description: str
    normalized_description: str
    amount_clp: int
    transaction_type: TransactionType
    raw_data: dict[str, Any] | None = None


class TransactionPreviewCandidate(TransactionCandidate):
    suggested_category_id: int | None = None
    personalized_category_id: int | None = None
    suggestion_reason: str | None = None
    suggestion_conflict: bool = False
    category_source: CategorySource | None = None
    rule_id_applied: int | None = None


class TransactionCandidateReview(SQLModel):
    source_id: str | None = None
    source_line: str
    transaction_type: TransactionType
    category_id: int | None = None
    action: str | None = None
    remember: bool = False
    pattern: str | None = None
    match_type: str = "exact"


class TransactionBase(SQLModel):
    account_id: int
    statement_id: int | None = None
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
    statement_id: int


class ManualTransactionInput(SQLModel):
    transaction_type: TransactionType
    amount_clp: int = Field(gt=0, le=2_147_483_647)
    date: date
    description: str = Field(min_length=1, max_length=240)
    category_id: int | None = None


class TransactionCategoryUpdate(SQLModel):
    category_id: int | None
    category_source: CategorySource | None = None
    action: str = "set"
    remember: bool = False
    pattern: str | None = None
    match_type: str = "exact"
    expected_version: int | None = None


class Transaction(TransactionBase):
    id: int
    origin: TransactionOrigin
    created_at: datetime
    updated_at: datetime | None = None
    is_internal_transfer: bool = False
    cash_transfer_linked: bool = False
    category_reviewed: bool = False
    category_version: int = 0
    category_event_id: int | None = None
    personalized_category_id: int | None = None
    suggestion_reason: str | None = None
    suggestion_conflict: bool = False
