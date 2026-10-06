from __future__ import annotations

from app.models.user import OwnedModel

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class CategorizationRuleModel(OwnedModel, table=True):
    __tablename__ = "categorization_rules"  # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    keyword: str = Field(index=True)
    category_id: int = Field(foreign_key="categories.id")
    priority: int = Field(default=100)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
