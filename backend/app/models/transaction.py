from __future__ import annotations

from app.models.user import OwnedModel

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel

from app.models._sql import enum_sql_type
from app.domain.enums import CategorySource, TransactionType


class TransactionModel(OwnedModel, table=True):
    __tablename__ = "transactions"  # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    statement_id: int = Field(foreign_key="statements.id")
    source_row: int | None = None
    date: date_type = Field(index=True)
    description: str
    normalized_description: str = Field(index=True)
    amount_clp: int
    transaction_type: TransactionType = Field(
        sa_column=Column(enum_sql_type(TransactionType), nullable=False),
    )
    category_id: int | None = Field(default=None, foreign_key="categories.id")
    category_source: CategorySource | None = Field(
        default=None,
        sa_column=Column(enum_sql_type(CategorySource), nullable=True),
    )
    rule_id_applied: int | None = Field(default=None, foreign_key="categorization_rules.id")
    fingerprint: str | None = Field(default=None, index=True)
    raw_data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime | None = None
