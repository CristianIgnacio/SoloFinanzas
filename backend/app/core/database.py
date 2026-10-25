from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import blake2b
from pathlib import Path
from threading import Lock
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import event, text
from sqlmodel import Session, create_engine, select

from app.core.config import settings
from app.core.auth import Identity, get_identity
from app.core.tenancy import TenantSession
from app.models.user import UserModel
from app.core.seeding import catalog_changes, consolidate_subscriptions, seed_default_categories, seed_default_categorization_rules
from app.services.accounts import ensure_cash_account
from app.services.catalogs import CATEGORY_CATALOG_VERSION, RULE_CATALOG_VERSION

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Compatibility only for offline legacy tooling. It is never opened at import/startup.
DB_PATH = BACKEND_DIR / settings.database_path

def make_engine(url: str):
    if url.startswith("sqlite:///") and url != "sqlite:///:memory:":
        path = Path(url.removeprefix("sqlite:///"))
        if not path.is_absolute():
            path = BACKEND_DIR / path
        path.parent.mkdir(parents=True, exist_ok=True)
        url = "sqlite:///" + path.as_posix()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {
        "pool_size": 3, "max_overflow": 2, "pool_pre_ping": True,
    }
    result = create_engine(url, hide_parameters=True, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(result, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
    else:
        @event.listens_for(result, "connect")
        def private_schema(connection, _):
            # A session setting works with Supavisor without relying on support
            # for PostgreSQL's optional startup 'options' parameter.
            previous = connection.autocommit
            connection.autocommit = True
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET SESSION search_path TO finance, public")
            finally:
                connection.autocommit = previous
    return result

engine = make_engine(settings.database_url)
_local_lock = Lock()

@contextmanager
def owner_connection(owner: UUID):
    """Serialize a user's requests across workers, including service commits.

    Use the Supabase SESSION pooler: transaction pooling cannot hold this lock.
    """
    key = int.from_bytes(blake2b(owner.bytes, digest_size=8).digest(), "big", signed=True)
    with engine.connect() as connection:
        postgres = connection.dialect.name == "postgresql"
        if postgres:
            connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": key})
            connection.commit()
        else:
            _local_lock.acquire()
        try:
            yield connection
        finally:
            connection.rollback()
            if postgres:
                connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
                connection.commit()
            else:
                _local_lock.release()


def ensure_user_catalog(connection, owner: UUID) -> list[dict]:
    """Install category and rule additions once, under the user's lock.

    Categories and the version marker share one transaction so failures can retry.
    Existing users retain their rules; removed earlier rules are not recreated.
    """
    with connection.begin():
        with Session(connection) as identities:
            profile = identities.get(UserModel, owner)
            if profile is None or profile.deletion_pending:
                return []
            categories_due = not profile.initialized or profile.category_catalog_version < CATEGORY_CATALOG_VERSION
            rules_due = not profile.initialized or profile.rule_catalog_version < RULE_CATALOG_VERSION
            if not categories_due and not rules_due:
                return []
            with TenantSession(connection, user_id=owner) as session:
                changes = catalog_changes(session, apply=True) if categories_due else []
                if categories_due and profile.category_catalog_version < 2:
                    consolidate_subscriptions(session)
                if rules_due:
                    session.flush()
                    seed_default_categorization_rules(session, since_version=-1 if not profile.initialized else profile.rule_catalog_version)
                session.commit()
            profile.initialized = True
            if categories_due:
                profile.category_catalog_version = CATEGORY_CATALOG_VERSION
            if rules_due:
                profile.rule_catalog_version = RULE_CATALOG_VERSION
            identities.add(profile)
            identities.commit()
    return changes


def get_session(request: Request, identity: Identity = Depends(get_identity)) -> Iterator[TenantSession]:
    with owner_connection(identity.id) as connection:
        with Session(connection) as identities:
            profile = identities.get(UserModel, identity.id)
            if profile is None:
                profile = UserModel(id=identity.id, email=identity.email, display_name=identity.name)
                identities.add(profile)
                identities.commit()
            deletion_pending = profile.deletion_pending
            if deletion_pending:
                if request.method not in ("GET", "DELETE") or request.url.path != "/api/v1/me":
                    raise HTTPException(403, "La cuenta está en proceso de eliminación.")
            if not deletion_pending:
                ensure_cash_account(identities, identity.id)
                identities.commit()
        if not deletion_pending:
            ensure_user_catalog(connection, identity.id)
        with TenantSession(connection, user_id=identity.id) as session:
            yield session
