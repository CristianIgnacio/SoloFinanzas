from __future__ import annotations

from datetime import datetime

from sqlmodel import SQLModel


class CategorizationRuleBase(SQLModel):
    keyword: str
    category_id: int
    priority: int = 100
    match_type: str = "contains"


class CategorizationRuleCreate(CategorizationRuleBase):
    pass


class CategorizationRuleSeed(SQLModel):
    keyword: str
    category_code: str
    transaction_type: str | None = None
    priority: int = 100
    match_type: str = "contains"
    introduced_in_version: int = 1


class CategorizationRule(CategorizationRuleBase):
    id: int
    is_active: bool = True
    origin: str = "user"
    transaction_type: str | None = None
    created_at: datetime
