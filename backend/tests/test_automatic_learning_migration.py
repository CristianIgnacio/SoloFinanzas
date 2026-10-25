"""Historical forgotten decisions stay forgotten after the additive migration."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID


class AutomaticLearningMigrationTests(unittest.TestCase):
    def test_migration_preserves_data_and_remembered_flags_and_blocks_forgotten_patterns(self):
        backend = Path(__file__).resolve().parents[1]
        owner = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").hex
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "learning.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(command, revision=None):
                result = subprocess.run([sys.executable, "-m", "alembic", command, *([revision] if revision else [])],
                    cwd=backend, env=environment, capture_output=True, text=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

            migrate("upgrade", "f53b8a629d10")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (owner,))
                connection.execute("INSERT INTO categories (id, user_id, name, type, is_default, is_active, sort_order) VALUES (1, ?, 'Personal', 'expense', 0, 1, 10)", (owner,))
                connection.execute("INSERT INTO accounts (id, user_id, name, institution, account_type, currency, created_at) VALUES (1, ?, 'Banco', 'banco_estado', 'vista', 'CLP', '2026-01-01')", (owner,))
                connection.execute("INSERT INTO statements (id, user_id, account_id, file_name, file_type, status, uploaded_at) VALUES (1, ?, 1, 'demo.pdf', 'pdf', 'processed', '2026-01-01')", (owner,))
                for ident, description, remembered in ((1, "comercio olvidado", 0), (2, "comercio recordado", 1)):
                    connection.execute("""INSERT INTO transactions (id, user_id, account_id, statement_id, date,
                        description, normalized_description, amount_clp, transaction_type, category_id,
                        category_source, category_reviewed, category_version, fingerprint, created_at)
                        VALUES (?, ?, 1, 1, '2026-01-02', ?, ?, -1000, 'expense', 1, 'manual', 1, 1, ?, '2026-01-02')""",
                        (ident, owner, description, description, f"fingerprint-{ident}"))
                    connection.execute("""INSERT INTO category_feedback (user_id, transaction_id, previous_reviewed,
                        category_id, pattern, match_type, remembered, is_active, version, created_at)
                        VALUES (?, ?, 0, 1, ?, 'exact', ?, 1, 1, '2026-01-02')""", (owner, ident, description, remembered))
                historical_transactions = connection.execute("SELECT * FROM transactions ORDER BY id").fetchall()
                historical_feedback = connection.execute("SELECT * FROM category_feedback ORDER BY id").fetchall()
            migrate("upgrade", "head")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("SELECT * FROM transactions ORDER BY id").fetchall(), historical_transactions)
                feedback = connection.execute("SELECT * FROM category_feedback ORDER BY id").fetchall()
                self.assertEqual([row[:len(historical_feedback[0])] for row in feedback], historical_feedback)
                self.assertEqual(connection.execute("SELECT pattern, state, learning_blocked FROM category_patterns").fetchall(),
                                 [("comercio olvidado", "rejected", 1)])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            migrate("check")
            migrate("downgrade", "f53b8a629d10")
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute("SELECT * FROM transactions ORDER BY id").fetchall(), historical_transactions)
                self.assertEqual(connection.execute("SELECT * FROM category_feedback ORDER BY id").fetchall(), historical_feedback)
