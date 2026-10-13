"""Provision an empty cash account for existing active users."""

from alembic import op
import sqlalchemy as sa


revision = "d82b62f4e8c1"
down_revision = "c68d6e6f43ad"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO accounts
            (user_id, name, account_kind, institution, account_type,
             product_code, account_last4, currency, created_at)
        SELECT u.id, 'Efectivo', 'cash', NULL, 'efectivo', NULL, NULL,
               'CLP', CURRENT_TIMESTAMP
        FROM users AS u
        WHERE u.deletion_pending = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM accounts AS a
              WHERE a.user_id = u.id AND a.account_kind = 'cash'
          )
    """))


def downgrade() -> None:
    # These are user accounts after provisioning. Keep them because the migration
    # cannot distinguish its rows from cash accounts subsequently used or edited.
    # The preceding revision's downgrade refuses to drop cash-aware columns.
    pass
