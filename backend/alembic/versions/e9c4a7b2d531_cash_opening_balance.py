"""Store an optional opening balance and its inclusive date on Efectivo."""

from alembic import op
import sqlalchemy as sa


revision = "e9c4a7b2d531"
down_revision = "d82b62f4e8c1"
branch_labels = None
depends_on = None


BALANCE_CHECK = (
    "(account_kind = 'financial' AND opening_balance_clp IS NULL "
    "AND opening_balance_date IS NULL) OR "
    "(account_kind = 'cash' AND "
    "((opening_balance_clp IS NULL AND opening_balance_date IS NULL) OR "
    "(opening_balance_clp IS NOT NULL "
    "AND opening_balance_clp BETWEEN 0 AND 2147483647 "
    "AND opening_balance_date IS NOT NULL)))"
)


def upgrade() -> None:
    connection = op.get_bind()
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        with op.batch_alter_table(
            "accounts", recreate="always" if sqlite else "auto",
            table_args=[sa.CheckConstraint(BALANCE_CHECK, name="ck_accounts_cash_opening_balance")]
            if sqlite else (),
        ) as batch:
            batch.add_column(sa.Column("opening_balance_clp", sa.Integer(), nullable=True))
            batch.add_column(sa.Column("opening_balance_date", sa.Date(), nullable=True))
        if not sqlite:
            op.create_check_constraint("ck_accounts_cash_opening_balance", "accounts", BALANCE_CHECK)
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    connection = op.get_bind()
    configured = connection.execute(sa.text(
        "SELECT 1 FROM accounts WHERE opening_balance_clp IS NOT NULL "
        "OR opening_balance_date IS NOT NULL LIMIT 1"
    )).first()
    if configured:
        raise RuntimeError("No se puede revertir: existen saldos iniciales de Efectivo.")

    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        if not sqlite:
            op.drop_constraint("ck_accounts_cash_opening_balance", "accounts", type_="check")
        with op.batch_alter_table("accounts", recreate="always" if sqlite else "auto") as batch:
            if sqlite:
                batch.drop_constraint("ck_accounts_cash_opening_balance", type_="check")
            batch.drop_column("opening_balance_clp")
            batch.drop_column("opening_balance_date")
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
