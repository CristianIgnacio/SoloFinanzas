"""First-use persistence on disposable databases only."""

from pathlib import Path
from contextlib import closing
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import UUID

from sqlmodel import Session

from app.core.database import make_engine
from app.core.tenancy import TenantSession
from app.domain.enums import InstitutionCode
from app.models.user import UserModel
from app.schemas.account import AccountCreate
from app.services.accounts import create_account
from app.api.routes.profile import OnboardingChoice, choose_onboarding
from app.core.auth import Identity


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
ACTIVE = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")


class OnboardingChoiceTests(unittest.TestCase):
    def test_migration_backfills_bank_and_preserves_cash_only_welcome(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database = Path(directory) / "onboarding.db"
            environment = {**os.environ, "DATABASE_URL": "sqlite:///" + database.as_posix()}

            def migrate(revision: str) -> None:
                result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
                                        cwd=backend, env=environment, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)

            migrate("a12f8e7d3b49")
            with closing(sqlite3.connect(database)) as connection, connection:
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (OWNER.hex,))
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (OTHER.hex,))
                connection.execute("INSERT INTO users (id, email, display_name, initialized, deletion_pending, created_at) VALUES (?, '', '', 1, 0, '2026-01-01')", (ACTIVE.hex,))
                connection.execute("INSERT INTO accounts (user_id, name, account_kind, institution, account_type, currency, created_at) VALUES (?, 'Banco', 'financial', 'banco_estado', 'vista', 'CLP', '2026-01-01')", (OWNER.hex,))
                connection.execute("INSERT INTO accounts (user_id, name, account_kind, institution, account_type, currency, created_at) VALUES (?, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', '2026-01-01')", (OTHER.hex,))
                connection.execute("INSERT INTO accounts (user_id, name, account_kind, institution, account_type, currency, opening_balance_clp, opening_balance_date, created_at) VALUES (?, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', 1000, '2026-01-01', '2026-01-01')", (ACTIVE.hex,))
            migrate("head")
            with closing(sqlite3.connect(database)) as connection, connection:
                self.assertEqual(connection.execute("SELECT onboarding_choice FROM users WHERE id=?", (OWNER.hex,)).fetchone()[0], "bank")
                self.assertIsNone(connection.execute("SELECT onboarding_choice FROM users WHERE id=?", (OTHER.hex,)).fetchone()[0])
                self.assertEqual(connection.execute("SELECT onboarding_choice FROM users WHERE id=?", (ACTIVE.hex,)).fetchone()[0], "cash")
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_cash_choice_and_bank_creation_are_owner_scoped(self) -> None:
        from sqlmodel import SQLModel
        with tempfile.TemporaryDirectory() as directory:
            engine = make_engine("sqlite:///" + (Path(directory) / "choice.db").as_posix())
            SQLModel.metadata.create_all(engine)
            with Session(engine) as session:
                session.add(UserModel(id=OWNER))
                session.add(UserModel(id=OTHER))
                session.commit()
            with TenantSession(engine, user_id=OWNER) as session:
                result = choose_onboarding(OnboardingChoice(choice="cash"),
                                           Identity(OWNER, "", "", {}), session)
                self.assertEqual(result["onboarding_choice"], "cash")
                create_account(session, AccountCreate(name="Banco", institution=InstitutionCode.BANCO_ESTADO,
                                                      account_type="vista"))
            with TenantSession(engine, user_id=OTHER) as session:
                create_account(session, AccountCreate(name="Banco", institution=InstitutionCode.BANCO_ESTADO,
                                                      account_type="vista"))
            with Session(engine) as session:
                self.assertEqual(session.get(UserModel, OWNER).onboarding_choice, "cash")
                self.assertEqual(session.get(UserModel, OTHER).onboarding_choice, "bank")
            engine.dispose()
