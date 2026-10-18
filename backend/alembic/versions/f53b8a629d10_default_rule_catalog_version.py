"""Track additive default rule releases independently from categories."""
from alembic import op
import sqlalchemy as sa

revision = "f53b8a629d10"
down_revision = "e42f861a09bc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("rule_catalog_version", sa.Integer(), nullable=False,
                                    server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "rule_catalog_version")
