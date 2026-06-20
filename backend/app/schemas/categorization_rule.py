from __future__ import annotations

from datetime import datetime

from sqlmodel import SQLModel


class CategorizationRuleBase(SQLModel):
    keyword: str
    category_id: int
    priority: int = 100


class CategorizationRuleCreate(CategorizationRuleBase):
    pass


class CategorizationRuleSeed(SQLModel):
    keyword: str
    category_name: str
    priority: int = 100


class CategorizationRule(CategorizationRuleBase):
    id: int
    created_at: datetime
