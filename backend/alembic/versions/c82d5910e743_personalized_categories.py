"""Add universal catalog identifiers, verified feedback and rule controls."""
from alembic import op
import sqlalchemy as sa

revision = "c82d5910e743"
down_revision = "c30d5f8a4e71"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("code", sa.String(), nullable=True))
    op.add_column("categories", sa.Column("description", sa.String(), nullable=False, server_default=""))
    op.create_index("ix_categories_code", "categories", ["code"])
    op.create_index("uq_category_owner_code", "categories", ["user_id", "code"], unique=True)
    op.add_column("categorization_rules", sa.Column("match_type", sa.String(), nullable=False, server_default="contains"))
    op.add_column("categorization_rules", sa.Column("origin", sa.String(), nullable=False, server_default="legacy"))
    op.add_column("categorization_rules", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("categorization_rules", sa.Column("transaction_type", sa.String(), nullable=True))
    op.add_column("transactions", sa.Column("category_reviewed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("transactions", sa.Column("category_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "category_feedback",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("previous_feedback_id", sa.Integer(), nullable=True),
        sa.Column("previous_category_id", sa.Integer(), nullable=True),
        sa.Column("previous_category_source", sa.String(), nullable=True),
        sa.Column("previous_rule_id", sa.Integer(), nullable=True),
        sa.Column("previous_reviewed", sa.Boolean(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("pattern", sa.String(), nullable=True),
        sa.Column("match_type", sa.String(), nullable=False),
        sa.Column("remembered", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["user_id", "transaction_id"], ["transactions.user_id", "transactions.id"],
                                name="fk_category_feedback_transaction_id_owner"),
        sa.UniqueConstraint("user_id", "id", name="uq_category_feedback_owner_id"),
    )
    op.create_index("ix_category_feedback_user_id", "category_feedback", ["user_id"])
    op.create_index("ix_category_feedback_transaction_id", "category_feedback", ["transaction_id"])
    op.create_index("ix_category_feedback_pattern", "category_feedback", ["pattern"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_api') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON finance.category_feedback TO finance_api;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO finance_api;
          END IF;
        END $$""")


def downgrade() -> None:
    op.drop_table("category_feedback")
    op.drop_column("transactions", "category_version")
    op.drop_column("transactions", "category_reviewed")
    op.drop_column("categorization_rules", "is_active")
    op.drop_column("categorization_rules", "transaction_type")
    op.drop_column("categorization_rules", "origin")
    op.drop_column("categorization_rules", "match_type")
    op.drop_index("uq_category_owner_code", table_name="categories")
    op.drop_index("ix_categories_code", table_name="categories")
    op.drop_column("categories", "description")
    op.drop_column("categories", "code")
