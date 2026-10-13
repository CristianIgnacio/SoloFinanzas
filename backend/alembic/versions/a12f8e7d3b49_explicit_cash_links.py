"""Mark explicit cash transfer matches so automatic recalculation preserves them."""

from alembic import op
import sqlalchemy as sa


revision = "a12f8e7d3b49"
down_revision = "e9c4a7b2d531"
branch_labels = None
depends_on = None


KIND_CHECK = "match_kind IN ('auto', 'cash')"


def upgrade() -> None:
    connection = op.get_bind()
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        with op.batch_alter_table(
            "internal_transfer_matches", recreate="always" if sqlite else "auto",
            table_args=[sa.CheckConstraint(KIND_CHECK, name="ck_internal_transfer_match_kind")]
            if sqlite else (),
        ) as batch:
            batch.add_column(sa.Column("match_kind", sa.String(length=8), nullable=False, server_default="auto"))
        if not sqlite:
            op.create_check_constraint("ck_internal_transfer_match_kind", "internal_transfer_matches", KIND_CHECK)
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(sa.text(
        "SELECT 1 FROM internal_transfer_matches WHERE match_kind = 'cash' LIMIT 1"
    )).first():
        raise RuntimeError("No se puede revertir: existen vínculos explícitos con Efectivo.")
    sqlite = connection.dialect.name == "sqlite"
    if sqlite:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
    try:
        if not sqlite:
            op.drop_constraint("ck_internal_transfer_match_kind", "internal_transfer_matches", type_="check")
        with op.batch_alter_table(
            "internal_transfer_matches", recreate="always" if sqlite else "auto",
        ) as batch:
            if sqlite:
                batch.drop_constraint("ck_internal_transfer_match_kind", type_="check")
            batch.drop_column("match_kind")
    finally:
        if sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
