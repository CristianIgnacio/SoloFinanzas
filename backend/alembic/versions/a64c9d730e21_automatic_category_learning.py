"""Automatic evidence for new decisions and persistent pattern lifecycle.

Existing remembered flags are preserved, including forgotten/ineligible history.
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone
from hashlib import sha256
import json
from uuid import UUID

revision = "a64c9d730e21"
down_revision = "f53b8a629d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("category_feedback", sa.Column("decision_kind", sa.String(), nullable=False, server_default="legacy"))
    for name in ("description_snapshot", "direction_snapshot", "decision_group"):
        op.add_column("category_feedback", sa.Column(name, sa.String(), nullable=True))
    patterns = op.create_table(
        "category_patterns",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("signature", sa.String(), nullable=False),
        sa.Column("pattern", sa.String(), nullable=False),
        sa.Column("match_type", sa.String(), nullable=False),
        sa.Column("transaction_type", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("decision_count", sa.Integer(), nullable=False),
        sa.Column("evidence_digest", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("snoozed_until", sa.DateTime(), nullable=True),
        sa.Column("learning_blocked", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id", "id", name="uq_category_patterns_owner_id"),
        sa.UniqueConstraint("user_id", "signature", name="uq_category_pattern_signature"),
    )
    op.create_index("ix_category_patterns_user_id", "category_patterns", ["user_id"])
    # In the old implementation only remembered decisions had a pattern. A
    # nonempty pattern with every remembered flag cleared records an explicit
    # forget. Preserve that preference without enabling other historical rows.
    forgotten = op.get_bind().execute(sa.text("""
        SELECT f.user_id, f.pattern, f.match_type, t.transaction_type
        FROM category_feedback f JOIN transactions t ON t.id = f.transaction_id AND t.user_id = f.user_id
        WHERE f.pattern IS NOT NULL AND f.pattern <> ''
        GROUP BY f.user_id, f.pattern, f.match_type, t.transaction_type
        HAVING SUM(CASE WHEN f.remembered THEN 1 ELSE 0 END) = 0
    """)).mappings().all()
    for row in forgotten:
        now = datetime.now(timezone.utc)
        key = sha256(json.dumps([row["pattern"], row["match_type"], row["transaction_type"]], ensure_ascii=False).encode()).hexdigest()
        reason = "Patrón olvidado antes de activar el aprendizaje automático."
        op.get_bind().execute(patterns.insert().values(
            user_id=UUID(str(row["user_id"])), signature=key, pattern=row["pattern"],
            match_type=row["match_type"], transaction_type=row["transaction_type"],
            state="rejected", evidence_count=0, decision_count=0, evidence_digest="",
            reason=reason, learning_blocked=True, version=1,
            history=[{"state": "rejected", "reason": reason, "at": now.isoformat()}],
            created_at=now, updated_at=now,
        ))
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_api') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON finance.category_patterns TO finance_api;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO finance_api;
          END IF;
        END $$""")


def downgrade() -> None:
    op.drop_table("category_patterns")
    for name in ("decision_group", "direction_snapshot", "description_snapshot", "decision_kind"):
        op.drop_column("category_feedback", name)
