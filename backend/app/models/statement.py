from __future__ import annotations

from app.models.user import OwnedModel

from datetime import datetime, timezone

from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.models._sql import enum_sql_type
from app.domain.enums import StatementStatus


class StatementModel(OwnedModel, table=True):
    __tablename__ = "statements"  # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="accounts.id")
    file_name: str
    file_type: str
    file_checksum: str | None = None
    period_month: str | None = Field(default=None, index=True)
    status: StatementStatus = Field(
        default=StatementStatus.PENDING,
        sa_column=Column(enum_sql_type(StatementStatus), index=True, nullable=False),
    )
    raw_path: str | None = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
