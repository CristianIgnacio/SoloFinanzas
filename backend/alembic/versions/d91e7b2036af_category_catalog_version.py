"""Track automatic catalog installation separately from account initialization."""
from alembic import op
import sqlalchemy as sa

revision = "d91e7b2036af"
down_revision = "c82d5910e743"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("category_catalog_version", sa.Integer(),
                                    nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "category_catalog_version")
