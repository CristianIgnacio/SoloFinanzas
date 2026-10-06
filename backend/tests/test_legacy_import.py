from datetime import date
import hashlib
from pathlib import Path
import sqlite3
import os
import tempfile
import unittest
from uuid import UUID
from sqlmodel import SQLModel, Session, select
from app.core.database import make_engine
from app.models import AccountModel, TransactionModel
from app.models.user import UserModel
from scripts.migrate_sqlite import migrate


class LegacyImportTests(unittest.TestCase):
    def test_dry_run_apply_and_repeat_leave_source_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'legacy-copy.db'
            with sqlite3.connect(source) as db:
                db.executescript("""
                CREATE TABLE accounts (id integer, name text, account_type text);
                INSERT INTO accounts VALUES (7, 'Demo', 'debito');
                CREATE TABLE categories (id integer, name text, type text);
                INSERT INTO categories VALUES (9, 'Demo', 'expense');
                CREATE TABLE statements (id integer, account_id integer, file_name text, file_type text, file_checksum text, raw_path text);
                INSERT INTO statements VALUES (8, 7, 'demo.pdf', 'pdf', 'checksum', 'private/path.pdf');
                CREATE TABLE transactions (id integer, account_id integer, statement_id integer, date text, description text, normalized_description text, amount_clp integer, transaction_type text, category_id integer, category_source text);
                INSERT INTO transactions VALUES (10, 7, 8, '2026-01-01', 'Demo', 'demo', -100, 'expense', 9, 'manual');
                INSERT INTO transactions VALUES (11, 7, 8, '2026-01-01', 'Demo', 'demo', -100, 'expense', 9, 'manual');
                """)
            db.close()
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            engine = make_engine(os.getenv('TEST_DATABASE_URL') or 'sqlite:///' + (Path(directory) / 'target.db').as_posix())
            SQLModel.metadata.create_all(engine)
            owner = UUID(int=1)
            report = migrate(source, engine, owner)
            self.assertFalse(report['applied'])
            with Session(engine) as s: self.assertEqual(s.exec(select(AccountModel)).all(), [])
            migrate(source, engine, owner, apply=True)
            with Session(engine) as s:
                rows = s.exec(select(TransactionModel)).all()
                self.assertEqual(len(rows), 2)
                self.assertEqual(sum(r.amount_clp for r in rows), -200)
                self.assertTrue(all(r.user_id == owner and r.category_source == 'manual' for r in rows))
            with self.assertRaises(ValueError): migrate(source, engine, owner, apply=True)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)
            SQLModel.metadata.drop_all(engine)
            engine.dispose()
