"""Backfill cash-transfer taxonomy on a disposable SQLite database."""

from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID


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


if __name__ == "__main__":
    unittest.main()
