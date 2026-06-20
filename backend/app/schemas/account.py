from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.domain.enums import CurrencyCode, InstitutionCode


class AccountBase(SQLModel):
    name: str
    institution: InstitutionCode = Field(default=InstitutionCode.BANCO_DE_CHILE)
    account_type: str
    account_last4: str | None = Field(default=None, max_length=4)
    currency: CurrencyCode = CurrencyCode.CLP


class AccountCreate(AccountBase):
    pass


class AccountUpdate(AccountBase):
    pass


class Account(AccountBase):
    id: int
    created_at: datetime
