from __future__ import annotations

import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from experiments.categorization.benchmark import report, run
from experiments.categorization.dataset import prepare, read_jsonl


class CategorizationBenchmarkTests(unittest.TestCase):
    def test_preparation_keeps_labels_and_original_text_out_of_model_cases(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            db_path = root / "sample.db"
            with sqlite3.connect(db_path) as db:
                db.executescript("""
                    CREATE TABLE transactions (
                        id INTEGER, user_id TEXT, date TEXT, description TEXT,
                        normalized_description TEXT, amount_clp INTEGER,
                        transaction_type TEXT, category_id INTEGER, category_source TEXT
                    );
                    CREATE TABLE categories (
                        id INTEGER, user_id TEXT, name TEXT, type TEXT,
                        parent_id INTEGER, is_active INTEGER
                    );
                    CREATE TABLE categorization_rules (
                        id INTEGER, user_id TEXT, keyword TEXT,
                        category_id INTEGER, priority INTEGER
                    );
                """)
                db.execute("INSERT INTO categories VALUES (1,'u','Comida','expense',NULL,1)")
                db.execute("INSERT INTO transactions VALUES (1,'u','2026-01-01',?,?,?,?,?,?)",
                           ("JUMBO ana@example.com 12345678", "jumbo ana@example.com 12345678",
                            -1000, "expense", 1, "manual"))
                db.execute("INSERT INTO categorization_rules VALUES (1,'u','jumbo',1,100)")
            db.close()
            out = root / "pilot"
            prepare(db_path, out, size=1)
            case = read_jsonl(out / "cases.jsonl")[0]
            self.assertNotIn("category_id", case)
            self.assertNotIn("user_id", case)
            self.assertNotIn("ana@example.com", case["description"])
            self.assertNotIn("12345678", case["description"])
            with (out / "review.csv").open(encoding="utf-8-sig", newline="") as handle:
                review = next(csv.DictReader(handle))
            self.assertIn("ana@example.com", review["description_original_local"])
            self.assertEqual(review["verified"], "")
            self.assertEqual(review["external_approved"], "")
            with self.assertRaisesRegex(ValueError, "external_approved"):
                run(out, "mercury", "B", None)
            review["external_approved"] = "si"
            review["description_depurada_a_enviar"] = "otro texto"
            with (out / "review.csv").open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(review))
                writer.writeheader()
                writer.writerow(review)
            with self.assertRaisesRegex(ValueError, "difiere"):
                run(out, "mercury", "B", None)
            with self.assertRaisesRegex(ValueError, "etiquetas verificadas"):
                report(out)


if __name__ == "__main__":
    unittest.main()
