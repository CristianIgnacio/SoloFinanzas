"""The personalized catalog migration must not recategorize existing data."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID


class PersonalizedCategoriesMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_preserve_categories_rules_and_movements(self):
        backend = Path(__file__).resolve().parents[1]
        owner = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").hex
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "personalized.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(command, revision=None):
                result = subprocess.run([sys.executable, "-m", "alembic", command, *([revision] if revision else [])],
                    cwd=backend, env=environment, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

            migrate("upgrade", "c30d5f8a4e71")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (owner,))
                connection.execute("INSERT INTO categories (id, user_id, name, type, is_default, is_active, sort_order) VALUES (10, ?, 'Mi comida', 'expense', 0, 1, 70)", (owner,))
                connection.execute("INSERT INTO categorization_rules (id, user_id, keyword, category_id, priority, created_at) VALUES (20, ?, 'mi comercio', 10, 17, '2026-01-01')", (owner,))
                connection.execute("INSERT INTO accounts (id, user_id, name, institution, account_type, currency, created_at) VALUES (1, ?, 'Banco', 'banco_estado', 'vista', 'CLP', '2026-01-01')", (owner,))
                connection.execute("INSERT INTO statements (id, user_id, account_id, file_name, file_type, status, uploaded_at) VALUES (1, ?, 1, 'demo.pdf', 'pdf', 'processed', '2026-01-01')", (owner,))
                connection.execute("""INSERT INTO transactions (id, user_id, account_id, statement_id, date,
                    description, normalized_description, amount_clp, transaction_type, category_id,
                    category_source, rule_id_applied, fingerprint, created_at)
                    VALUES (30, ?, 1, 1, '2026-01-02', 'Mi comercio', 'mi comercio', -1000,
                    'expense', 10, 'rule', 20, 'original-fingerprint', '2026-01-02')""", (owner,))

            migrate("upgrade", "head")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("SELECT category_catalog_version FROM users").fetchall(), [(0,)])
                self.assertEqual(connection.execute("SELECT rule_catalog_version FROM users").fetchall(), [(0,)])
                self.assertEqual(connection.execute("SELECT id, name, code FROM categories").fetchall(), [(10, "Mi comida", None)])
                self.assertEqual(connection.execute("SELECT icon, color FROM categories").fetchall(), [(None, None)])
                self.assertEqual(connection.execute("SELECT id, priority, origin, match_type, is_active FROM categorization_rules").fetchall(), [(20, 17, "legacy", "contains", 1)])
                self.assertEqual(connection.execute("SELECT id, category_id, rule_id_applied, category_reviewed, category_version, fingerprint FROM transactions").fetchall(), [(30, 10, 20, 0, 0, "original-fingerprint")])
                self.assertEqual(connection.execute("SELECT count(*) FROM category_feedback").fetchone()[0], 0)
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            migrate("check")
            migrate("downgrade", "c30d5f8a4e71")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("SELECT id, name FROM categories").fetchall(), [(10, "Mi comida")])
                self.assertEqual(connection.execute("SELECT id, priority FROM categorization_rules").fetchall(), [(20, 17)])
                self.assertEqual(connection.execute("SELECT id, category_id, rule_id_applied, fingerprint FROM transactions").fetchall(), [(30, 10, 20, "original-fingerprint")])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
