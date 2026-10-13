"""Exercise the cash-ready schema without changing any configured database."""

from __future__ import annotations

from contextlib import closing
from datetime import date
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID
from uuid import uuid4
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException
import psycopg
from psycopg import sql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.tenancy import TenantSession
from app.domain.enums import AccountKind, TransactionOrigin
from app.models import AccountModel, StatementModel, TransactionModel
from app.models.user import UserModel


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class CashModelMigrationTests(unittest.TestCase):
    def test_upgrade_preserves_history_and_restricts_new_records(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "cash-ready.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(command: str, revision: str, succeeds: bool = True) -> None:
                result = subprocess.run(
                    [sys.executable, "-m", "alembic", command, revision],
                    cwd=backend, env=environment, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode == 0, succeeds, result.stderr)

            migrate("upgrade", "b427eac61230")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO users VALUES (?, '', '', 1, 0, '2026-01-01 00:00:00')",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, institution, account_type, currency, created_at)
                    VALUES (1, ?, 'Cuenta antigua', 'banco_estado', 'vista', 'CLP', '2026-01-01 00:00:00')""",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO statements
                    (id, user_id, account_id, file_name, file_type, status, uploaded_at)
                    VALUES (1, ?, 1, 'enero.pdf', 'pdf', 'processed', '2026-01-02 00:00:00')""",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO transactions
                    (id, user_id, account_id, statement_id, date, description,
                     normalized_description, amount_clp, transaction_type, created_at)
                    VALUES (1, ?, 1, 1, '2026-01-02', 'Compra', 'compra', -100,
                            'expense', '2026-01-02 00:00:00')""",
                    (OWNER.hex,),
                )

            migrate("upgrade", "c68d6e6f43ad")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(connection.execute(
                    "SELECT id, account_kind, institution FROM accounts"
                ).fetchall(), [(1, "financial", "banco_estado")])
                self.assertEqual(connection.execute(
                    "SELECT id, account_id, statement_id, origin FROM transactions"
                ).fetchall(), [(1, 1, 1, "pdf")])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertIn(
                    "uq_accounts_one_cash_per_user",
                    {row[1] for row in connection.execute("PRAGMA index_list(accounts)")},
                )
                self.assertIn(
                    "ix_transactions_account_id",
                    {row[1] for row in connection.execute("PRAGMA index_list(transactions)")},
                )

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """INSERT INTO accounts
                        (user_id, name, account_kind, institution, account_type, currency, created_at)
                        VALUES (?, 'Invalida', 'financial', NULL, 'vista', 'CLP', '2026-01-01')""",
                        (OWNER.hex,),
                    )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, account_kind, institution, account_type, currency, created_at)
                    VALUES (2, ?, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', '2026-01-01')""",
                    (OWNER.hex,),
                )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """INSERT INTO accounts
                        (user_id, name, account_kind, institution, account_type, currency, created_at)
                        VALUES (?, 'Duplicada', 'cash', NULL, 'efectivo', 'CLP', '2026-01-01')""",
                        (OWNER.hex,),
                    )
                connection.execute(
                    """INSERT INTO transactions
                    (id, user_id, account_id, statement_id, origin, date, description,
                     normalized_description, amount_clp, transaction_type, created_at)
                    VALUES (2, ?, 2, NULL, 'manual', '2026-01-03', 'Compra', 'compra', -50,
                            'expense', '2026-01-03')""",
                    (OWNER.hex,),
                )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """INSERT INTO transactions
                        (user_id, account_id, statement_id, origin, date, description,
                         normalized_description, amount_clp, transaction_type, created_at)
                        VALUES (?, 2, NULL, 'pdf', '2026-01-03', 'Incorrecta', 'incorrecta',
                                -50, 'expense', '2026-01-03')""",
                        (OWNER.hex,),
                    )

            migrate("downgrade", "b427eac61230", succeeds=False)
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("DELETE FROM transactions WHERE id = 2")
                connection.execute("DELETE FROM accounts WHERE id = 2")
            migrate("downgrade", "b427eac61230")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(connection.execute(
                    "SELECT account_id, statement_id FROM transactions"
                ).fetchall(), [(1, 1)])


@unittest.skipUnless(
    os.getenv("TEST_POSTGRES_ADMIN_URL"), "Requires a disposable PostgreSQL test server",
)
class CashPostgresMigrationTests(unittest.TestCase):
    def test_upgrade_and_guarded_downgrade(self) -> None:
        admin_url = os.environ["TEST_POSTGRES_ADMIN_URL"]
        database_name = "sf_cash_test_" + uuid4().hex
        database_url = urlunsplit(urlsplit(admin_url)._replace(path="/" + database_name))
        backend = Path(__file__).resolve().parents[1]
        environment = {**os.environ, "DATABASE_URL": database_url}

        def migrate(command: str, revision: str, succeeds: bool = True) -> None:
            result = subprocess.run(
                [sys.executable, "-m", "alembic", command, revision],
                cwd=backend, env=environment, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode == 0, succeeds, result.stderr)

        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
            try:
                migrate("upgrade", "b427eac61230")
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    connection.execute(
                        """INSERT INTO users
                        (id, email, display_name, initialized, deletion_pending, created_at)
                        VALUES (%s, '', '', TRUE, FALSE, NOW())""",
                        (OWNER,),
                    )
                    connection.execute(
                        """INSERT INTO accounts
                        (id, user_id, name, institution, account_type, currency, created_at)
                        VALUES (1, %s, 'Anterior', 'banco_estado', 'vista', 'CLP', NOW())""",
                        (OWNER,),
                    )
                    connection.execute(
                        """INSERT INTO statements
                        (id, user_id, account_id, file_name, file_type, status, uploaded_at)
                        VALUES (1, %s, 1, 'enero.pdf', 'pdf', 'processed', NOW())""",
                        (OWNER,),
                    )
                    connection.execute(
                        """INSERT INTO transactions
                        (id, user_id, account_id, statement_id, date, description,
                         normalized_description, amount_clp, transaction_type, created_at)
                        VALUES (1, %s, 1, 1, CURRENT_DATE, 'Compra', 'compra', -100,
                                'expense', NOW())""",
                        (OWNER,),
                    )

                migrate("upgrade", "c68d6e6f43ad")
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    self.assertEqual(connection.execute(
                        "SELECT id, account_kind FROM accounts"
                    ).fetchall(), [(1, "financial")])
                    self.assertEqual(connection.execute(
                        "SELECT id, account_id, statement_id, origin FROM transactions"
                    ).fetchall(), [(1, 1, 1, "pdf")])
                    with self.assertRaises(psycopg.errors.CheckViolation):
                        connection.execute(
                            """INSERT INTO accounts
                            (user_id, name, institution, account_type, currency, created_at)
                            VALUES (%s, 'Invalida', NULL, 'vista', 'CLP', NOW())""",
                            (OWNER,),
                        )
                    connection.execute(
                        """INSERT INTO accounts
                        (id, user_id, name, institution, account_kind, account_type,
                         currency, created_at)
                        VALUES (2, %s, 'Efectivo', NULL, 'cash', 'efectivo', 'CLP', NOW())""",
                        (OWNER,),
                    )
                    with self.assertRaises(psycopg.errors.UniqueViolation):
                        connection.execute(
                            """INSERT INTO accounts
                            (user_id, name, institution, account_kind, account_type,
                             currency, created_at)
                            VALUES (%s, 'Duplicada', NULL, 'cash', 'efectivo', 'CLP', NOW())""",
                            (OWNER,),
                        )
                    with self.assertRaises(psycopg.errors.CheckViolation):
                        connection.execute(
                            """INSERT INTO transactions
                            (user_id, account_id, statement_id, origin, date, description,
                             normalized_description, amount_clp, transaction_type, created_at)
                            VALUES (%s, 2, NULL, 'pdf', CURRENT_DATE, 'Invalida',
                                    'invalida', -50, 'expense', NOW())""",
                            (OWNER,),
                        )
                    connection.execute(
                        """INSERT INTO transactions
                        (id, user_id, account_id, statement_id, origin, date, description,
                         normalized_description, amount_clp, transaction_type, created_at)
                        VALUES (2, %s, 2, NULL, 'manual', CURRENT_DATE, 'Manual',
                                'manual', -50, 'expense', NOW())""",
                        (OWNER,),
                    )

                migrate("downgrade", "b427eac61230", succeeds=False)
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    connection.execute("DELETE FROM transactions WHERE id = 2")
                    connection.execute("DELETE FROM accounts WHERE id = 2")
                migrate("downgrade", "b427eac61230")
                with psycopg.connect(database_url) as connection:
                    connection.execute("SET search_path TO finance, public")
                    self.assertEqual(connection.execute(
                        "SELECT account_id, statement_id FROM transactions"
                    ).fetchall(), [(1, 1)])
            finally:
                admin.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(database_name),
                    )
                )


class CashOwnershipTests(unittest.TestCase):
    def test_tenant_boundary_requires_cash_for_unlinked_movements(self) -> None:
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                session.add_all([UserModel(id=OWNER), UserModel(id=OTHER)])
                session.commit()
            with TenantSession(engine, user_id=OWNER) as session:
                cash = AccountModel(
                    name="Efectivo", account_kind=AccountKind.CASH,
                    institution=None, account_type="efectivo",
                )
                bank = AccountModel(name="Banco", account_type="vista")
                session.add_all([cash, bank])
                session.flush()
                statement = StatementModel(
                    account_id=bank.id, file_name="a.pdf", file_type="pdf",
                )
                session.add(statement)
                session.commit()
                cash_id, bank_id, statement_id = cash.id, bank.id, statement.id
            with TenantSession(engine, user_id=OTHER) as session:
                other_bank = AccountModel(name="Banco ajeno", account_type="vista")
                session.add(other_bank)
                session.flush()
                other_statement = StatementModel(
                    account_id=other_bank.id, file_name="ajena.pdf", file_type="pdf",
                )
                session.add(other_statement)
                session.commit()
                other_statement_id = other_statement.id
            with TenantSession(engine, user_id=OTHER) as session:
                foreign = TransactionModel(
                    account_id=cash_id, statement_id=None, origin=TransactionOrigin.MANUAL,
                    date=date(2026, 1, 1), description="Ajena", normalized_description="ajena",
                    amount_clp=-100, transaction_type="expense",
                )
                session.add(foreign)
                with self.assertRaises(HTTPException) as caught:
                    session.flush()
                self.assertEqual(caught.exception.status_code, 404)
            with TenantSession(engine, user_id=OWNER) as session:
                foreign_statement = TransactionModel(
                    account_id=bank_id, statement_id=other_statement_id,
                    date=date(2026, 1, 1), description="Cartola ajena",
                    normalized_description="cartola ajena", amount_clp=-100,
                    transaction_type="expense",
                )
                session.add(foreign_statement)
                with self.assertRaises(HTTPException) as caught:
                    session.flush()
                self.assertEqual(caught.exception.status_code, 404)
                session.rollback()
                invalid = TransactionModel(
                    account_id=bank_id, statement_id=None, origin=TransactionOrigin.MANUAL,
                    date=date(2026, 1, 1), description="Invalida", normalized_description="invalida",
                    amount_clp=-100, transaction_type="expense",
                )
                session.add(invalid)
                with self.assertRaises(HTTPException):
                    session.flush()
                session.rollback()
                valid = TransactionModel(
                    account_id=cash_id, statement_id=None, origin=TransactionOrigin.MANUAL,
                    date=date(2026, 1, 1), description="Manual", normalized_description="manual",
                    amount_clp=-100, transaction_type="expense",
                )
                session.add(valid)
                session.commit()
                self.assertIsNotNone(valid.id)
                imported = TransactionModel(
                    account_id=bank_id, statement_id=statement_id,
                    date=date(2026, 1, 1), description="PDF", normalized_description="pdf",
                    amount_clp=-100, transaction_type="expense",
                )
                session.add(imported)
                session.commit()
                self.assertEqual(imported.origin, TransactionOrigin.PDF)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
