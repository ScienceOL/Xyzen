"""add consumerecord (user_id, created_at) composite index

Revision ID: a1f2b3c4d5e6
Revises: e8b677d1381b
Create Date: 2026-02-19 22:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1f2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8b677d1381b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add composite index on (user_id, created_at) for consumption range queries."""
    op.create_index(
        "idx_consumerecord_user_created",
        "consumerecord",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    """Remove composite index on (user_id, created_at)."""
    op.drop_index("idx_consumerecord_user_created", table_name="consumerecord")
