from __future__ import annotations

from app.models.user import OwnedModel

from datetime import date, datetime, timezone

from sqlalchemy import CheckConstraint, Column, Index, text
from sqlmodel import Field, SQLModel

from app.models._sql import enum_sql_type
from app.domain.enums import AccountKind, CurrencyCode, InstitutionCode


class AccountModel(OwnedModel, table=True):
    __tablename__ = "accounts"  # type: ignore
    __table_args__ = (
        CheckConstraint(
            "(account_kind = 'financial' AND institution IS NOT NULL) OR "
            "(account_kind = 'cash' AND institution IS NULL AND "
            "product_code IS NULL AND account_last4 IS NULL)",
            name="ck_accounts_kind_fields",
        ),
        CheckConstraint(
            "(account_kind = 'financial' AND opening_balance_clp IS NULL "
            "AND opening_balance_date IS NULL) OR "
            "(account_kind = 'cash' AND "
            "((opening_balance_clp IS NULL AND opening_balance_date IS NULL) OR "
            "(opening_balance_clp IS NOT NULL "
            "AND opening_balance_clp BETWEEN 0 AND 2147483647 "
            "AND opening_balance_date IS NOT NULL)))",
            name="ck_accounts_cash_opening_balance",
        ),
        Index(
            "uq_accounts_one_cash_per_user", "user_id", unique=True,
            sqlite_where=text("account_kind = 'cash'"),
            postgresql_where=text("account_kind = 'cash'"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str
    account_kind: AccountKind = Field(
        default=AccountKind.FINANCIAL,
        sa_column=Column(
            enum_sql_type(AccountKind), nullable=False,
            server_default=AccountKind.FINANCIAL.value,
        ),
    )
    institution: InstitutionCode | None = Field(
        default=InstitutionCode.BANCO_DE_CHILE,
        sa_column=Column(enum_sql_type(InstitutionCode), nullable=True),
    )
    account_type: str
    product_code: str | None = Field(default=None, max_length=80)
    account_last4: str | None = Field(default=None, max_length=4)
    opening_balance_clp: int | None = Field(default=None)
    opening_balance_date: date | None = Field(default=None)
    currency: CurrencyCode = Field(
        default=CurrencyCode.CLP,
        sa_column=Column(enum_sql_type(CurrencyCode), nullable=False),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
