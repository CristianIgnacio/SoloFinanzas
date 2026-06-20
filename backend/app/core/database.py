from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.config import settings
from app.models import (
    AccountModel,
    CategorizationRuleModel,
    CategoryModel,
    StatementModel,
    TransactionModel,
)
from app.services.catalogs import DEFAULT_CATEGORIES, DEFAULT_CATEGORIZATION_RULES
from app.services.categorization_rules import _normalize_keyword


BACKEND_DIR = Path(__file__).resolve().parents[2]


def _resolve_database_path() -> Path:
    """Resuelve la ruta SQLite configurada contra el directorio del backend."""
    configured_path = Path(settings.database_path)
    if configured_path.is_absolute():
        return configured_path
    return BACKEND_DIR / configured_path


DB_PATH = _resolve_database_path()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


def get_session() -> Iterator[Session]:
    """Entrega una sesion SQLModel por request y la cierra al finalizar."""
    with Session(engine) as session:
        yield session


def init_db() -> Path:
    """Crea tablas, normaliza datos heredados y siembra catalogos base."""
    SQLModel.metadata.create_all(engine)
    normalize_legacy_transaction_types()
    with Session(engine) as session:
        seed_default_categories(session)
        session.flush()
        seed_default_categorization_rules(session)
        session.flush()
        from app.services.internal_transfers import refresh_internal_transfer_matches

        refresh_internal_transfer_matches(session)
        session.commit()
    return DB_PATH


def normalize_legacy_transaction_types() -> None:
    """Migra tipos de transaccion antiguos hacia ingreso o gasto segun monto."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                UPDATE transactions
                SET transaction_type = CASE
                    WHEN amount_clp >= 0 THEN 'income'
                    ELSE 'expense'
                END
                WHERE transaction_type IN ('transfer', 'unknown')
                """
            )
        )


def seed_default_categories(session: Session) -> None:
    """Inserta categorias predeterminadas que aun no existan en la base."""
    existing_names = {
        category.name
        for category in session.exec(select(CategoryModel)).all()
    }
    for category in DEFAULT_CATEGORIES:
        if category.name in existing_names:
            continue
        session.add(
            CategoryModel(
                name=category.name,
                type=category.type,
                is_default=category.is_default,
            )
        )


def seed_default_categorization_rules(session: Session) -> None:
    """Inserta reglas predeterminadas vinculandolas a sus categorias base."""
    categories_by_name = {
        category.name: category.id
        for category in session.exec(select(CategoryModel)).all()
    }
    existing_rules = {
        (_normalize_keyword(rule.keyword), rule.category_id)
        for rule in session.exec(select(CategorizationRuleModel)).all()
        if rule.keyword.strip()
    }

    for rule in DEFAULT_CATEGORIZATION_RULES:
        category_id = categories_by_name.get(rule.category_name)
        if category_id is None:
            raise ValueError(
                f"No existe la categoria predeterminada '{rule.category_name}' "
                f"para la regla '{rule.keyword}'."
            )

        normalized_keyword = _normalize_keyword(rule.keyword)
        rule_key = (normalized_keyword, category_id)
        if rule_key in existing_rules:
            continue

        session.add(
            CategorizationRuleModel(
                keyword=normalized_keyword,
                category_id=category_id,
                priority=rule.priority,
            )
        )
        existing_rules.add(rule_key)
