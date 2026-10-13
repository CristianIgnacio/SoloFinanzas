"""Persist the first-use path independently of automatic cash provisioning."""

from alembic import op
import sqlalchemy as sa


revision = "f47c1e8a92b0"
down_revision = "a12f8e7d3b49"
branch_labels = None
depends_on = None

CHECK = "onboarding_choice IS NULL OR onboarding_choice IN ('bank', 'cash')"


def upgrade() -> None:
    connection = op.get_bind()
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        with op.batch_alter_table("users", recreate="always" if sqlite else "auto",
                                  table_args=[sa.CheckConstraint(CHECK, name="ck_users_onboarding_choice")]
                                  if sqlite else ()) as batch:
            batch.add_column(sa.Column("onboarding_choice", sa.String(length=8), nullable=True))
        if not sqlite:
            op.create_check_constraint("ck_users_onboarding_choice", "users", CHECK)
        connection.execute(sa.text("""
            UPDATE users SET onboarding_choice = 'bank'
            WHERE EXISTS (SELECT 1 FROM accounts
                          WHERE accounts.user_id = users.id AND accounts.account_kind = 'financial')
        """))
        connection.execute(sa.text("""
            UPDATE users SET onboarding_choice = 'cash'
            WHERE onboarding_choice IS NULL AND EXISTS (
                SELECT 1 FROM accounts
                WHERE accounts.user_id = users.id AND accounts.account_kind = 'cash'
                  AND (accounts.opening_balance_date IS NOT NULL OR EXISTS (
                      SELECT 1 FROM transactions WHERE transactions.account_id = accounts.id
                  ))
            )
        """))
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    connection = op.get_bind()
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        if not sqlite:
            op.drop_constraint("ck_users_onboarding_choice", "users", type_="check")
        with op.batch_alter_table("users", recreate="always" if sqlite else "auto") as batch:
            if sqlite:
                batch.drop_constraint("ck_users_onboarding_choice", type_="check")
            batch.drop_column("onboarding_choice")
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
