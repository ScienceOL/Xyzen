"""Add sort_order to Agent

Revision ID: 5c6c342a4420
Revises: 90e892e60144
Create Date: 2026-01-26 19:44:39.313549

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c6c342a4420"
down_revision: Union[str, Sequence[str], None] = "90e892e60144"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add column as nullable first with default 0
    op.add_column("agent", sa.Column("sort_order", sa.Integer(), nullable=True, server_default="0"))

    # Update existing rows to have sequential sort_order per user
    op.execute("""
        WITH ranked AS (
            SELECT id, user_id,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 as new_order
            FROM agent
        )
        UPDATE agent
        SET sort_order = ranked.new_order
        FROM ranked
        WHERE agent.id = ranked.id
    """)

    # Now make it non-nullable
    op.alter_column("agent", "sort_order", nullable=False)

    # Remove server_default (not needed after migration)
    op.alter_column("agent", "sort_order", server_default=None)

    # Create index
    op.create_index(op.f("ix_agent_sort_order"), "agent", ["sort_order"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agent_sort_order"), table_name="agent")
    op.drop_column("agent", "sort_order")
