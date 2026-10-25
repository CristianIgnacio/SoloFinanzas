"""Optional category appearance overrides; children inherit their parent."""
from alembic import op
import sqlalchemy as sa

revision = "e42f861a09bc"
down_revision = "d91e7b2036af"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("icon", sa.String(), nullable=True))
    op.add_column("categories", sa.Column("color", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "color")
    op.drop_column("categories", "icon")
