import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from app.core.migrations import apply_database_migrations


class DatabaseMigrationTests(unittest.TestCase):
    def test_hierarchy_migration_preserves_ids_and_merges_gasto(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "legacy.db"
            with closing(sqlite3.connect(database_path)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE categories (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        type TEXT NOT NULL,
                        is_default INTEGER NOT NULL DEFAULT 1
                    );
                    CREATE TABLE transactions (
                        id INTEGER PRIMARY KEY,
                        category_id INTEGER REFERENCES categories(id)
                    );
                    CREATE TABLE categorization_rules (
                        id INTEGER PRIMARY KEY,
                        category_id INTEGER NOT NULL REFERENCES categories(id)
                    );
                    INSERT INTO categories (id, name, type) VALUES
                        (1, 'Ingresos', 'income'),
                        (2, 'Sueldo', 'income'),
                        (3, 'Gasto', 'expense'),
                        (4, 'Otros', 'expense'),
                        (5, 'Deudas y creditos', 'expense');
                    INSERT INTO transactions (id, category_id) VALUES (10, 3);
                    INSERT INTO categorization_rules (id, category_id) VALUES (20, 3);
                    """
                )
                connection.commit()

            backup_path = apply_database_migrations(database_path)

            with closing(sqlite3.connect(database_path)) as connection:
                sueldo_parent = connection.execute(
                    "SELECT parent_id FROM categories WHERE id = 2"
                ).fetchone()[0]
                gasto_count = connection.execute(
                    "SELECT count(*) FROM categories WHERE name = 'Gasto'"
                ).fetchone()[0]
                transaction_category = connection.execute(
                    "SELECT category_id FROM transactions WHERE id = 10"
                ).fetchone()[0]
                rule_category = connection.execute(
                    "SELECT category_id FROM categorization_rules WHERE id = 20"
                ).fetchone()[0]
                violations = connection.execute("PRAGMA foreign_key_check").fetchall()

            self.assertIsNotNone(backup_path)
            self.assertTrue(backup_path.exists())
            self.assertEqual(sueldo_parent, 1)
            self.assertEqual(gasto_count, 0)
            self.assertEqual(transaction_category, 4)
            self.assertEqual(rule_category, 4)
            self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
