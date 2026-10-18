from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import CheckConstraint
from sqlmodel import Field, SQLModel


class UserModel(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(
        "onboarding_choice IS NULL OR onboarding_choice IN ('bank', 'cash')",
        name="ck_users_onboarding_choice",
    ),)

    id: UUID = Field(primary_key=True)
    email: str = ""
    display_name: str = ""
    initialized: bool = False
    category_catalog_version: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    rule_catalog_version: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    deletion_pending: bool = False
    onboarding_choice: str | None = Field(default=None, max_length=8)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OwnedModel(SQLModel):
    # Assigned exclusively by TenantSession before INSERT. Never part of input schemas.
    user_id: UUID | None = Field(default=None, foreign_key="users.id", nullable=False, index=True)
