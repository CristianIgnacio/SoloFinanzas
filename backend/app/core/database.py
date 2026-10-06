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
from app.core.seeding import seed_default_categories, seed_default_categorization_rules

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


def get_session(request: Request, identity: Identity = Depends(get_identity)) -> Iterator[TenantSession]:
    with owner_connection(identity.id) as connection:
        with Session(connection) as identities:
            profile = identities.get(UserModel, identity.id)
            if profile is None:
                profile = UserModel(id=identity.id, email=identity.email, display_name=identity.name)
                identities.add(profile)
                identities.commit()
            if profile.deletion_pending:
                if request.method not in ("GET", "DELETE") or request.url.path != "/api/v1/me":
                    raise HTTPException(403, "La cuenta está en proceso de eliminación.")
            initialized = profile.initialized
        with TenantSession(connection, user_id=identity.id) as session:
            if not initialized and not profile.deletion_pending:
                seed_default_categories(session)
                session.flush()
                seed_default_categorization_rules(session)
                session.commit()
                with Session(connection) as identities:
                    profile = identities.get(UserModel, identity.id)
                    profile.initialized = True
                    identities.add(profile)
                    identities.commit()
            yield session
