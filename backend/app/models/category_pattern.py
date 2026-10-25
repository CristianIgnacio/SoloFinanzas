"""Persistent lifecycle of a personal categorization pattern."""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field

from app.models.user import OwnedModel


class CategoryPatternModel(OwnedModel, table=True):
    __tablename__ = "category_patterns"
    __table_args__ = (UniqueConstraint("user_id", "signature", name="uq_category_pattern_signature"),)

    id: int | None = Field(default=None, primary_key=True)
    signature: str
    pattern: str
    match_type: str = "exact"
    transaction_type: str
    state: str = "observing"
    # Historical identifiers, intentionally retained after deletion of a rule/category.
    category_id: int | None = None
    rule_id: int | None = None
    evidence_count: int = 0
    decision_count: int = 0
    evidence_digest: str = ""
    reason: str = ""
    snoozed_until: datetime | None = None
    learning_blocked: bool = False
    version: int = 1
    history: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
