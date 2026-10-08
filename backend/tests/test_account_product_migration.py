"""Verify conservative product backfill on an isolated SQLite database."""

import os
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


class AccountProductMigrationTests(unittest.TestCase):
    def test_backfill_only_exact_product_identity(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "accounts.db"
            environment = {
                **os.environ,
                "DATABASE_URL": "sqlite:///" + database.as_posix(),
            }

            def migrate(target: str) -> None:
                result = subprocess.run(
                    [sys.executable, "-m", "alembic", "upgrade", target],
                    cwd=backend, env=environment, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

            migrate("8645ff693793")
            with closing(sqlite3.connect(database)) as connection:
                owner = "a" * 32
                connection.execute(
                    "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
                    (owner, "", "", 1, 0, "2026-01-01 00:00:00"),
                )
                examples = (
                    (1, "CuentaRUT", "banco_estado", "vista", "1111"),
                    (2, "Gastos diarios", "banco_estado", "vista", "2222"),
                    (3, "CuentaRUT", "banco_estado", "credito", "3333"),
                    (4, "Cuenta Corriente", "banco_falabella", "Cuenta corriente", "4444"),
                    (5, "Cuenta Digital Copec Pay", "copecpay", "billetera_digital", "5555"),
                )
                connection.executemany(
                    """INSERT INTO accounts
                    (id, user_id, name, institution, account_type, account_last4,
                     currency, created_at) VALUES (?, ?, ?, ?, ?, ?, 'CLP', ?)""",
                    [(*row[:1], owner, *row[1:], "2026-01-01 00:00:00") for row in examples],
                )
                connection.executemany(
                    """INSERT INTO statements
                    (id, user_id, account_id, file_name, file_type, status, uploaded_at)
                    VALUES (?, ?, ?, 'cartola.pdf', 'pdf', 'processed', ?)""",
                    [(10, owner, 1, "2026-01-02 00:00:00"),
                     (20, owner, 2, "2026-01-02 00:00:00")],
                )
                connection.executemany(
                    """INSERT INTO transactions
                    (id, user_id, account_id, statement_id, date, description,
                     normalized_description, amount_clp, transaction_type, created_at)
                    VALUES (?, ?, ?, ?, '2026-01-02', 'Compra', 'compra', -100,
                            'expense', ?)""",
                    [(100, owner, 1, 10, "2026-01-02 00:00:00"),
                     (200, owner, 2, 20, "2026-01-02 00:00:00")],
                )
                connection.commit()

            migrate("head")
            with closing(sqlite3.connect(database)) as connection:
                rows = connection.execute(
                    "SELECT id, product_code, account_last4 FROM accounts ORDER BY id"
                ).fetchall()
                statements = connection.execute(
                    "SELECT id, account_id FROM statements ORDER BY id"
                ).fetchall()
                transactions = connection.execute(
                    "SELECT id, account_id, statement_id FROM transactions ORDER BY id"
                ).fetchall()
                violations = connection.execute("PRAGMA foreign_key_check").fetchall()

            self.assertEqual(rows, [
                (1, "banco_estado_cuenta_rut", "1111"),
                (2, None, "2222"),
                (3, None, "3333"),
                (4, "banco_falabella_corriente", "4444"),
                (5, "copecpay_cuenta_digital", "5555"),
            ])
            self.assertEqual(statements, [(10, 1), (20, 2)])
            self.assertEqual(transactions, [(100, 1, 10), (200, 2, 20)])
            self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
