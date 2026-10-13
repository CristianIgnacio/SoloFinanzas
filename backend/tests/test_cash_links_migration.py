"""Validate cash-link schema changes only against disposable databases."""

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


class CashLinksSQLiteMigrationTests(unittest.TestCase):
    def test_preserves_auto_matches_and_guards_explicit_links(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "cash-links.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(command: str, revision: str, succeeds: bool = True) -> None:
                result = subprocess.run(
                    [sys.executable, "-m", "alembic", command, revision],
                    cwd=backend, env=environment, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode == 0, succeeds, result.stderr)

            migrate("upgrade", "e9c4a7b2d531")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute(
                    "INSERT INTO users VALUES (?, '', '', 1, 0, '2026-01-01')", (OWNER.hex,),
                )
                for account_id in (1, 2):
                    connection.execute(
                        """INSERT INTO accounts
                        (id, user_id, name, institution, account_type, currency, created_at)
                        VALUES (?, ?, 'Banco', 'banco_estado', 'vista', 'CLP', '2026-01-01')""",
                        (account_id, OWNER.hex),
                    )
                    connection.execute(
                        """INSERT INTO statements
                        (id, user_id, account_id, file_name, file_type, status, uploaded_at)
                        VALUES (?, ?, ?, 'a.pdf', 'pdf', 'processed', '2026-01-01')""",
                        (account_id, OWNER.hex, account_id),
                    )
                    amount = -100 if account_id == 1 else 100
                    connection.execute(
                        """INSERT INTO transactions
                        (id, user_id, account_id, statement_id, date, description,
                         normalized_description, amount_clp, transaction_type, created_at)
                        VALUES (?, ?, ?, ?, '2026-01-02', 'Transferencia', 'transferencia',
                                ?, ?, '2026-01-02')""",
                        (account_id, OWNER.hex, account_id, account_id, amount,
                         "expense" if amount < 0 else "income"),
                    )
                connection.execute(
                    """INSERT INTO internal_transfer_matches
                    (id, user_id, outgoing_transaction_id, incoming_transaction_id,
                     amount_clp, date_gap_days, created_at)
                    VALUES (9, ?, 1, 2, 100, 0, '2026-01-02')""", (OWNER.hex,),
                )

            migrate("upgrade", "a12f8e7d3b49")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                self.assertEqual(connection.execute(
                    "SELECT id, outgoing_transaction_id, incoming_transaction_id, match_kind "
                    "FROM internal_transfer_matches"
                ).fetchall(), [(9, 1, 2, "auto")])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertIn("ix_internal_transfer_matches_outgoing_transaction_id", {
                    row[1] for row in connection.execute("PRAGMA index_list(internal_transfer_matches)")
                })
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE internal_transfer_matches SET match_kind='invalid' WHERE id=9"
                    )
                connection.execute(
                    "UPDATE internal_transfer_matches SET match_kind='cash' WHERE id=9"
                )
            migrate("downgrade", "e9c4a7b2d531", succeeds=False)
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute(
                    "UPDATE internal_transfer_matches SET match_kind='auto' WHERE id=9"
                )
            migrate("downgrade", "e9c4a7b2d531")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(connection.execute(
                    "SELECT id, outgoing_transaction_id, incoming_transaction_id "
                    "FROM internal_transfer_matches"
                ).fetchall(), [(9, 1, 2)])


@unittest.skipUnless(os.getenv("TEST_POSTGRES_ADMIN_URL"), "Requires disposable PostgreSQL test server")
class CashLinksPostgresMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        admin_url = os.environ["TEST_POSTGRES_ADMIN_URL"]
        database_name = "sf_cash_links_" + uuid4().hex[:12]
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
                migrate("upgrade", "e9c4a7b2d531")
                migrate("upgrade", "a12f8e7d3b49")
                with psycopg.connect(database_url) as connection:
                    column = connection.execute(
                        """SELECT is_nullable, column_default FROM information_schema.columns
                        WHERE table_schema='finance' AND table_name='internal_transfer_matches'
                          AND column_name='match_kind'"""
                    ).fetchone()
                    self.assertEqual(column[0], "NO")
                    self.assertIn("auto", column[1])
                    self.assertIsNotNone(connection.execute(
                        """SELECT 1 FROM information_schema.table_constraints
                        WHERE table_schema='finance' AND table_name='internal_transfer_matches'
                          AND constraint_name='ck_internal_transfer_match_kind'"""
                    ).fetchone())
                migrate("downgrade", "e9c4a7b2d531")
            finally:
                admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(database_name)))


if __name__ == "__main__":
    unittest.main()
