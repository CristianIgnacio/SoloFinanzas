"""Cash provisioning uses only disposable test databases."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException
import psycopg
from psycopg import sql
from starlette.requests import Request
from sqlmodel import Session, SQLModel, select

from app.core import database
from app.core.auth import Identity
from app.core.tenancy import TenantSession
from app.domain.enums import AccountKind
from app.models.account import AccountModel
from app.models.user import UserModel
from app.schemas.account import AccountUpdate
from app.services.accounts import (
    AccountDeleteConflictError, AccountProductValidationError,
    delete_account, list_accounts, update_account,
)


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
PENDING = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")


class CashProvisioningTests(unittest.TestCase):
    def test_login_provisions_once_and_protects_cash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            engine = database.make_engine(
                "sqlite:///" + (Path(directory) / "cash.db").as_posix(),
            )
            SQLModel.metadata.create_all(engine)
            try:
                identity = Identity(OWNER, "owner@example.test", "Owner", {})

                def visit() -> None:
                    request = Request({
                        "type": "http", "method": "GET", "path": "/api/v1/accounts",
                        "headers": [], "query_string": b"", "scheme": "http",
                        "server": ("test", 80),
                    })
                    flow = database.get_session(request, identity)
                    session = next(flow)
                    self.assertEqual(list_accounts(session), [])
                    flow.close()

                with patch.object(database, "engine", engine):
                    with ThreadPoolExecutor(max_workers=6) as pool:
                        list(pool.map(lambda _: visit(), range(8)))

                with Session(engine) as session:
                    user = session.get(UserModel, OWNER)
                    self.assertTrue(user.initialized)
                    cash = session.exec(select(AccountModel).where(
                        AccountModel.user_id == OWNER,
                        AccountModel.account_kind == AccountKind.CASH,
                    )).all()
                    self.assertEqual(len(cash), 1)
                    self.assertEqual(cash[0].name, "Efectivo")
                    self.assertIsNone(cash[0].institution)
                    self.assertIsNone(cash[0].product_code)
                    self.assertIsNone(cash[0].account_last4)
                    cash_id = cash[0].id

                with TenantSession(engine, user_id=OWNER) as session:
                    with self.assertRaises(AccountProductValidationError):
                        update_account(session, cash_id, AccountUpdate(
                            name="Otro nombre", account_type="vista",
                        ))
                    with self.assertRaises(AccountDeleteConflictError):
                        delete_account(session, cash_id)
                    account = session.get(AccountModel, cash_id)
                    account.account_kind = AccountKind.FINANCIAL
                    with self.assertRaises(HTTPException):
                        session.flush()
            finally:
                engine.dispose()

    def test_pending_deletion_does_not_recreate_cash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            engine = database.make_engine(
                "sqlite:///" + (Path(directory) / "pending.db").as_posix(),
            )
            SQLModel.metadata.create_all(engine)
            try:
                with Session(engine) as session:
                    session.add(UserModel(id=PENDING, deletion_pending=True))
                    session.commit()
                request = Request({
                    "type": "http", "method": "GET", "path": "/api/v1/me",
                    "headers": [], "query_string": b"", "scheme": "http",
                    "server": ("test", 80),
                })
                identity = Identity(PENDING, "", "", {})
                with patch.object(database, "engine", engine):
                    flow = database.get_session(request, identity)
                    next(flow)
                    flow.close()
                with Session(engine) as session:
                    self.assertEqual(session.exec(select(AccountModel)).all(), [])
            finally:
                engine.dispose()


class CashBackfillTests(unittest.TestCase):
    def test_migration_preserves_existing_accounts_and_skips_pending_users(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(dir=backend / "data") as directory:
            database_path = Path(directory) / "backfill.db"
            environment = {
                **os.environ, "DATABASE_URL": "sqlite:///" + database_path.as_posix(),
            }

            def migrate(command: str, revision: str) -> None:
                result = subprocess.run(
                    [sys.executable, "-m", "alembic", command, revision],
                    cwd=backend, env=environment, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

            migrate("upgrade", "c68d6e6f43ad")
            with closing(sqlite3.connect(database_path)) as connection, connection:
                connection.execute("PRAGMA foreign_keys=ON")
                for user_id, pending in ((OWNER, 0), (OTHER, 0), (PENDING, 1)):
                    connection.execute(
                        """INSERT INTO users
                        (id, email, display_name, initialized, deletion_pending, created_at)
                        VALUES (?, '', '', 1, ?, CURRENT_TIMESTAMP)""",
                        (user_id.hex, pending),
                    )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, institution, account_type, currency, created_at)
                    VALUES (1, ?, 'Banco', 'banco_estado', 'vista', 'CLP', CURRENT_TIMESTAMP)""",
                    (OWNER.hex,),
                )
                connection.execute(
                    """INSERT INTO accounts
                    (id, user_id, name, account_kind, institution, account_type,
                     currency, created_at)
                    VALUES (2, ?, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', CURRENT_TIMESTAMP)""",
                    (OTHER.hex,),
                )

            migrate("upgrade", "head")
            with closing(sqlite3.connect(database_path)) as connection:
                self.assertEqual(connection.execute(
                    "SELECT id, user_id, account_kind FROM accounts ORDER BY id"
                ).fetchall(), [
                    (1, OWNER.hex, "financial"),
                    (2, OTHER.hex, "cash"),
                    (3, OWNER.hex, "cash"),
                ])
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            migrate("downgrade", "c68d6e6f43ad")
            with closing(sqlite3.connect(database_path)) as connection:
                self.assertEqual(connection.execute(
                    "SELECT count(*) FROM accounts WHERE account_kind = 'cash'"
                ).fetchone()[0], 2)


@unittest.skipUnless(
    os.getenv("TEST_POSTGRES_ADMIN_URL"), "Requires a disposable PostgreSQL test server",
)
class CashPostgresBackfillTests(unittest.TestCase):
    def test_backfills_active_users_once(self) -> None:
        admin_url = os.environ["TEST_POSTGRES_ADMIN_URL"]
        database_name = "sf_cash_backfill_" + uuid4().hex
        database_url = urlunsplit(urlsplit(admin_url)._replace(path="/" + database_name))
        backend = Path(__file__).resolve().parents[1]
        environment = {**os.environ, "DATABASE_URL": database_url}

        def migrate(command: str, revision: str) -> None:
            result = subprocess.run(
                [sys.executable, "-m", "alembic", command, revision],
                cwd=backend, env=environment, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
            try:
                migrate("upgrade", "c68d6e6f43ad")
                with psycopg.connect(database_url, autocommit=True) as connection:
                    connection.execute("SET search_path TO finance, public")
                    for user_id, pending in ((OWNER, False), (OTHER, False), (PENDING, True)):
                        connection.execute(
                            """INSERT INTO users
                            (id, email, display_name, initialized, deletion_pending, created_at)
                            VALUES (%s, '', '', TRUE, %s, NOW())""",
                            (user_id, pending),
                        )
                    connection.execute(
                        """INSERT INTO accounts
                        (user_id, name, institution, account_type, currency, created_at)
                        VALUES (%s, 'Banco', 'banco_estado', 'vista', 'CLP', NOW())""",
                        (OWNER,),
                    )
                    existing_cash_id = connection.execute(
                        """INSERT INTO accounts
                        (user_id, name, account_kind, institution, account_type,
                         currency, created_at)
                        VALUES (%s, 'Efectivo', 'cash', NULL, 'efectivo', 'CLP', NOW())
                        RETURNING id""",
                        (OTHER,),
                    ).fetchone()[0]
                migrate("upgrade", "head")
                with psycopg.connect(database_url) as connection:
                    connection.execute("SET search_path TO finance, public")
                    rows = connection.execute(
                        "SELECT user_id, id FROM accounts WHERE account_kind = 'cash'"
                    ).fetchall()
                    self.assertEqual({user_id for user_id, _ in rows}, {OWNER, OTHER})
                    self.assertEqual(len(rows), 2)
                    self.assertEqual(dict(rows)[OTHER], existing_cash_id)
            finally:
                admin.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(database_name),
                    )
                )
