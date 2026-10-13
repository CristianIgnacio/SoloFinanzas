"""Prepare account and transaction records for a future cash account."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c68d6e6f43ad"
down_revision = "b427eac61230"
branch_labels = None
depends_on = None


ACCOUNT_FIELDS_CHECK = (
    "(account_kind = 'financial' AND institution IS NOT NULL) OR "
    "(account_kind = 'cash' AND institution IS NULL AND "
    "product_code IS NULL AND account_last4 IS NULL)"
)
TRANSACTION_ORIGIN_CHECK = (
    "(origin = 'pdf' AND statement_id IS NOT NULL) OR "
    "(origin IN ('manual', 'cash_transfer') AND statement_id IS NULL)"
)
INSTITUTION_TYPE = sa.Enum(
    "banco_de_chile", "banco_santander", "copecpay", "mercadopago",
    "banco_estado", "banco_falabella", name="institutioncode", native_enum=False,
)


def upgrade() -> None:
    connection = op.get_bind()
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        with op.batch_alter_table(
            "accounts", recreate="always" if sqlite else "auto",
            table_args=[sa.CheckConstraint(ACCOUNT_FIELDS_CHECK, name="ck_accounts_kind_fields")]
            if sqlite else (),
        ) as batch:
            batch.add_column(sa.Column(
                "account_kind", sa.Enum("financial", "cash", name="accountkind", native_enum=False),
                nullable=False, server_default="financial",
            ))
            batch.alter_column("institution", existing_type=INSTITUTION_TYPE, nullable=True)
        if not sqlite:
            op.create_check_constraint("ck_accounts_kind_fields", "accounts", ACCOUNT_FIELDS_CHECK)
        op.create_index(
            "uq_accounts_one_cash_per_user", "accounts", ["user_id"], unique=True,
            sqlite_where=sa.text("account_kind = 'cash'"),
            postgresql_where=sa.text("account_kind = 'cash'"),
        )

        with op.batch_alter_table(
            "transactions", recreate="always" if sqlite else "auto",
            table_args=[sa.CheckConstraint(TRANSACTION_ORIGIN_CHECK, name="ck_transactions_origin_statement")]
            if sqlite else (),
        ) as batch:
            batch.add_column(sa.Column(
                "origin", sa.Enum("pdf", "manual", "cash_transfer", name="transactionorigin", native_enum=False),
                nullable=False, server_default="pdf",
            ))
            batch.alter_column("statement_id", existing_type=sa.Integer(), nullable=True)
        if not sqlite:
            op.create_check_constraint("ck_transactions_origin_statement", "transactions", TRANSACTION_ORIGIN_CHECK)
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    connection = op.get_bind()
    cash_account = connection.execute(sa.text(
        "SELECT 1 FROM accounts WHERE account_kind = 'cash' LIMIT 1"
    )).first()
    unlinked_transaction = connection.execute(sa.text(
        "SELECT 1 FROM transactions WHERE origin != 'pdf' OR statement_id IS NULL LIMIT 1"
    )).first()
    if cash_account or unlinked_transaction:
        raise RuntimeError("No se puede revertir: existen cuentas Efectivo o movimientos sin cartola.")

    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        if not sqlite:
            op.drop_constraint("ck_transactions_origin_statement", "transactions", type_="check")
        with op.batch_alter_table("transactions", recreate="always" if sqlite else "auto") as batch:
            if sqlite:
                batch.drop_constraint("ck_transactions_origin_statement", type_="check")
            batch.alter_column("statement_id", existing_type=sa.Integer(), nullable=False)
            batch.drop_column("origin")

        op.drop_index("uq_accounts_one_cash_per_user", table_name="accounts")
        if not sqlite:
            op.drop_constraint("ck_accounts_kind_fields", "accounts", type_="check")
        with op.batch_alter_table("accounts", recreate="always" if sqlite else "auto") as batch:
            if sqlite:
                batch.drop_constraint("ck_accounts_kind_fields", type_="check")
            batch.alter_column("institution", existing_type=INSTITUTION_TYPE, nullable=False)
            batch.drop_column("account_kind")
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
