from __future__ import annotations

from app.models.user import OwnedModel

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class InternalTransferMatchModel(OwnedModel, table=True):
    __tablename__ = "internal_transfer_matches"  # type: ignore
    __table_args__ = (
        CheckConstraint("match_kind IN ('auto', 'cash')", name="ck_internal_transfer_match_kind"),
        UniqueConstraint(
            "outgoing_transaction_id",
            name="uq_internal_transfer_outgoing_transaction",
        ),
        UniqueConstraint(
            "incoming_transaction_id",
            name="uq_internal_transfer_incoming_transaction",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    outgoing_transaction_id: int = Field(foreign_key="transactions.id", index=True)
    incoming_transaction_id: int = Field(foreign_key="transactions.id", index=True)
    amount_clp: int
    date_gap_days: int
    match_kind: str = Field(default="auto", sa_column=Column(
        String(length=8), nullable=False, server_default="auto",
    ))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
