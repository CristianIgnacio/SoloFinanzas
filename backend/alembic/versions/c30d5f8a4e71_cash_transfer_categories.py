"""Add cash withdrawal and deposit categories for existing users."""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "c30d5f8a4e71"
down_revision = "f47c1e8a92b0"
branch_labels = None
depends_on = None

CATEGORIES = (
    ("Retiro de efectivo", 10, ("giro en cajero", "giro cajero", "giro atm",
                                "retiro en cajero", "retiro de efectivo", "retiro efectivo")),
    ("Depósito de efectivo", 20, ("depósito en efectivo", "deposito en efectivo",
                                  "depósito efectivo", "deposito efectivo",
                                  "depósito por caja", "deposito por caja")),
)


def upgrade() -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, autoload_with=connection)
    categories = sa.Table("categories", metadata, autoload_with=connection)
    rules = sa.Table("categorization_rules", metadata, autoload_with=connection)

    for user_id in connection.execute(sa.select(users.c.id)).scalars():
        root_id = connection.execute(sa.select(categories.c.id).where(
            categories.c.user_id == user_id,
            categories.c.name == "Transferencias",
            categories.c.parent_id.is_(None),
            categories.c.type == "transfer",
        )).scalar_one_or_none()
        if root_id is None:
            root_id = connection.execute(categories.insert().values(
                user_id=user_id, parent_id=None, name="Transferencias", type="transfer",
                is_default=True, is_active=True, sort_order=110,
            )).inserted_primary_key[0]
        for name, sort_order, keywords in CATEGORIES:
            category_id = connection.execute(sa.select(categories.c.id).where(
                categories.c.user_id == user_id,
                categories.c.parent_id == root_id,
                categories.c.name == name,
            )).scalar_one_or_none()
            if category_id is None:
                category_id = connection.execute(categories.insert().values(
                    user_id=user_id, parent_id=root_id, name=name, type="transfer",
                    is_default=True, is_active=True, sort_order=sort_order,
                )).inserted_primary_key[0]
            for keyword in keywords:
                exists = connection.execute(sa.select(rules.c.id).where(
                    rules.c.user_id == user_id,
                    rules.c.category_id == category_id,
                    sa.func.lower(rules.c.keyword) == keyword,
                )).first()
                if exists is None:
                    connection.execute(rules.insert().values(
                        user_id=user_id, category_id=category_id, keyword=keyword,
                        priority=40, created_at=datetime.now(timezone.utc),
                    ))


def downgrade() -> None:
    # These categories may already classify real movements. Keep user data intact.
    pass
