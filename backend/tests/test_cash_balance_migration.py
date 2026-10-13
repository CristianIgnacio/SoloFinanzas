"""Migrate only disposable databases; never the configured application database."""

from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID, uuid4
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


class CashBalanceSQLiteMigrationTests(unittest.TestCase):
    def test_history_constraints_and_guarded_downgrade(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "opening.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(command: str, revision: str, succeeds: bool = True) -> None:
                result = subprocess.run(
                    [sys.executable, "-m", "alembic", command, revision],
                    cwd=backend, env=environment, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode == 0, succeeds, result.stderr)

            migrate("upgrade", "d82b62f4e8c1")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO users VALUES (?, '', '', 1, 0, '2026-01-01 00:00:00')",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, institution, account_type, currency, created_at)
                    VALUES (1, ?, 'Banco', 'banco_estado', 'vista', 'CLP', '2026-01-01')""",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, account_kind, institution, account_type, currency, created_at)
                    VALUES (2, ?, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', '2026-01-01')""",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO transactions
                    (id, user_id, account_id, statement_id, origin, date, description,
                     normalized_description, amount_clp, transaction_type, created_at)
                    VALUES (7, ?, 2, NULL, 'manual', '2026-10-10', 'Manual',
                            'manual', -50, 'expense', '2026-10-10')""",
                    (OWNER.hex,),
                )

            migrate("upgrade", "e9c4a7b2d531")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(connection.execute(
                    "SELECT id, account_kind, opening_balance_clp, opening_balance_date FROM accounts ORDER BY id"
                ).fetchall(), [(1, "financial", None, None), (2, "cash", None, None)])
                self.assertEqual(connection.execute(
                    "SELECT id, account_id, origin, amount_clp FROM transactions"
                ).fetchall(), [(7, 2, "manual", -50)])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertIn("uq_accounts_one_cash_per_user", {
                    row[1] for row in connection.execute("PRAGMA index_list(accounts)")
                })
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute("UPDATE accounts SET opening_balance_clp=100 WHERE id=2")
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute("UPDATE accounts SET opening_balance_date='2026-10-10' WHERE id=2")
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE accounts SET opening_balance_clp=100, opening_balance_date='2026-10-10' WHERE id=1"
                    )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE accounts SET opening_balance_clp=-1, opening_balance_date='2026-10-10' WHERE id=2"
                    )
                connection.execute(
                    "UPDATE accounts SET opening_balance_clp=100, opening_balance_date='2026-10-10' WHERE id=2"
                )

            migrate("downgrade", "d82b62f4e8c1", succeeds=False)
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute(
                    "UPDATE accounts SET opening_balance_clp=NULL, opening_balance_date=NULL WHERE id=2"
                )
            migrate("downgrade", "d82b62f4e8c1")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(connection.execute(
                    "SELECT id, account_id FROM transactions"
                ).fetchall(), [(7, 2)])


@unittest.skipUnless(os.getenv("TEST_POSTGRES_ADMIN_URL"), "Requires disposable PostgreSQL test server")
class CashBalancePostgresMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        admin_url = os.environ["TEST_POSTGRES_ADMIN_URL"]
        database_name = "sf_cash_balance_" + uuid4().hex[:12]
        parsed = urlsplit(admin_url)
        database_url = urlunsplit((parsed.scheme, parsed.netloc, "/" + database_name, parsed.query, parsed.fragment))
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
                migrate("upgrade", "d82b62f4e8c1")
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    connection.execute(
                        """INSERT INTO users
                        (id, email, display_name, initialized, deletion_pending, created_at)
                        VALUES (%s, '', '', TRUE, FALSE, NOW())""", (OWNER,),
                    )
                    cash_id = connection.execute(
                        """INSERT INTO accounts
                        (user_id, name, account_kind, institution, account_type, currency, created_at)
                        VALUES (%s, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', NOW())
                        RETURNING id""", (OWNER,),
                    ).fetchone()[0]
                    connection.execute(
                        """INSERT INTO transactions
                        (user_id, account_id, statement_id, origin, date, description,
                         normalized_description, amount_clp, transaction_type, created_at)
                        VALUES (%s, %s, NULL, 'manual', CURRENT_DATE, 'Manual',
                                'manual', -50, 'expense', NOW())""", (OWNER, cash_id),
                    )
                migrate("upgrade", "e9c4a7b2d531")
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    with self.assertRaises(psycopg.errors.CheckViolation):
                        connection.execute(
                            "UPDATE accounts SET opening_balance_clp=100 WHERE id=%s", (cash_id,),
                        )
                    connection.execute(
                        "UPDATE accounts SET opening_balance_clp=100, opening_balance_date=CURRENT_DATE WHERE id=%s",
                        (cash_id,),
                    )
                migrate("downgrade", "d82b62f4e8c1", succeeds=False)
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    connection.execute(
                        "UPDATE accounts SET opening_balance_clp=NULL, opening_balance_date=NULL WHERE id=%s",
                        (cash_id,),
                    )
                migrate("downgrade", "d82b62f4e8c1")
            finally:
                admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(database_name)))


if __name__ == "__main__":
    unittest.main()
