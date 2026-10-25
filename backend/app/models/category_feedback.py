from datetime import datetime, timezone

from sqlmodel import Field

from app.models.user import OwnedModel


class CategoryFeedbackModel(OwnedModel, table=True):
    __tablename__ = "category_feedback"

    id: int | None = Field(default=None, primary_key=True)
    transaction_id: int = Field(foreign_key="transactions.id", index=True)
    previous_feedback_id: int | None = Field(default=None)
    previous_category_id: int | None = Field(default=None)
    previous_category_source: str | None = Field(default=None)
    previous_rule_id: int | None = Field(default=None)
    previous_reviewed: bool = Field(default=False)
    category_id: int | None = Field(default=None)
    pattern: str | None = Field(default=None, index=True)
    match_type: str = Field(default="exact")
    remembered: bool = Field(default=False)
    is_active: bool = Field(default=True)
    version: int = Field(default=1)
    decision_kind: str = "legacy"
    description_snapshot: str | None = None
    direction_snapshot: str | None = None
    decision_group: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
