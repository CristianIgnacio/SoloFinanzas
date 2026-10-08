from __future__ import annotations

from app.models.user import OwnedModel

from datetime import datetime, timezone

from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.models._sql import enum_sql_type
from app.domain.enums import CurrencyCode, InstitutionCode


class AccountModel(OwnedModel, table=True):
    __tablename__ = "accounts"  # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    name: str
    institution: InstitutionCode = Field(
        default=InstitutionCode.BANCO_DE_CHILE,
        sa_column=Column(enum_sql_type(InstitutionCode), nullable=False),
    )
    account_type: str
    product_code: str | None = Field(default=None, max_length=80)
    account_last4: str | None = Field(default=None, max_length=4)
    currency: CurrencyCode = Field(
        default=CurrencyCode.CLP,
        sa_column=Column(enum_sql_type(CurrencyCode), nullable=False),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
