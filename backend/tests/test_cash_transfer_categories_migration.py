"""Backfill cash-transfer taxonomy on a disposable SQLite database."""

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
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class CashTransferCategoryMigrationTests(unittest.TestCase):
    def test_backfills_existing_user_without_changing_existing_category(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "categories.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(revision: str) -> None:
                result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
                                        cwd=backend, env=environment, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)

            migrate("f47c1e8a92b0")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (OWNER.hex,))
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (OTHER.hex,))
                connection.execute("INSERT INTO categories (id, user_id, name, type, is_default, is_active, sort_order) VALUES (50, ?, 'Transferencias', 'transfer', 1, 1, 110)", (OWNER.hex,))
                connection.execute("INSERT INTO categories (id, user_id, name, type, is_default, is_active, sort_order) VALUES (51, ?, 'Otros', 'expense', 1, 1, 100)", (OWNER.hex,))
            migrate("head")
            with closing(sqlite3.connect(database)) as connection, connection:
                categories = connection.execute("SELECT name, parent_id, type FROM categories WHERE user_id=? ORDER BY id", (OWNER.hex,)).fetchall()
                self.assertEqual(categories, [
                    ("Transferencias", None, "transfer"), ("Otros", None, "expense"),
                    ("Retiro de efectivo", 50, "transfer"),
                    ("Depósito de efectivo", 50, "transfer"),
                ])
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM categorization_rules WHERE user_id=? AND priority=40", (OWNER.hex,)).fetchone()[0], 12)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM categories WHERE user_id=?", (OTHER.hex,)).fetchone()[0], 3)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM categorization_rules WHERE user_id=? AND priority=40", (OTHER.hex,)).fetchone()[0], 12)
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])


@unittest.skipUnless(os.getenv("TEST_POSTGRES_ADMIN_URL"), "Requires disposable PostgreSQL test server")
class CashTransferCategoryPostgresMigrationTests(unittest.TestCase):
    def test_backfills_existing_users_in_finance_schema(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        admin_url = os.environ["TEST_POSTGRES_ADMIN_URL"]
        database_name = "sf_cash_categories_" + uuid4().hex[:12]
        parsed = urlsplit(admin_url)
        database_url = urlunsplit((parsed.scheme, parsed.netloc, "/" + database_name,
                                   parsed.query, parsed.fragment))
        environment = {**os.environ, "DATABASE_URL": database_url}

        def migrate(revision: str) -> None:
            result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
                                    cwd=backend, env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
            try:
                migrate("f47c1e8a92b0")
                with psycopg.connect(database_url) as connection:
                    connection.execute("SET search_path TO finance, public")
                    connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) "
                                       "VALUES (%s, '', '', TRUE, FALSE, NOW()), "
                                       "(%s, '', '', TRUE, FALSE, NOW())",
                                       (OWNER, OTHER))
                    root_id = connection.execute(
                        "INSERT INTO categories (user_id, name, type, is_default, is_active, sort_order) "
                        "VALUES (%s, 'Transferencias', 'transfer', TRUE, TRUE, 110) RETURNING id",
                        (OWNER,),
                    ).fetchone()[0]
                migrate("head")
                with psycopg.connect(database_url) as connection:
                    connection.execute("SET search_path TO finance, public")
                    owner_categories = connection.execute(
                        "SELECT name, parent_id FROM categories WHERE user_id=%s ORDER BY id", (OWNER,),
                    ).fetchall()
                    self.assertEqual(owner_categories, [
                        ("Transferencias", None), ("Retiro de efectivo", root_id),
                        ("Depósito de efectivo", root_id),
                    ])
                    self.assertEqual(connection.execute(
                        "SELECT count(*) FROM categories WHERE user_id=%s", (OTHER,),
                    ).fetchone()[0], 3)
                    self.assertEqual(connection.execute(
                        "SELECT count(*) FROM categorization_rules WHERE user_id=%s AND priority=40",
                        (OWNER,),
                    ).fetchone()[0], 12)
            finally:
                admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                    sql.Identifier(database_name)))


if __name__ == "__main__":
    unittest.main()
