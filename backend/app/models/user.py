from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Field, SQLModel


class UserModel(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(primary_key=True)
    email: str = ""
    display_name: str = ""
    initialized: bool = False
    deletion_pending: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OwnedModel(SQLModel):
    # Assigned exclusively by TenantSession before INSERT. Never part of input schemas.
    user_id: UUID | None = Field(default=None, foreign_key="users.id", nullable=False, index=True)
