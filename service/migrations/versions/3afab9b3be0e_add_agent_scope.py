"""add agent scope

Revision ID: 3afab9b3be0e
Revises: de3ff879f68e
Create Date: 2025-12-10 15:22:04.359263

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3afab9b3be0e"
down_revision: Union[str, Sequence[str], None] = "de3ff879f68e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    agent_scope_enum = sa.Enum("system", "user", name="agentscope")
    agent_scope_enum.create(op.get_bind(), checkfirst=True)

    # Add column as nullable first
    op.add_column("agent", sa.Column("scope", agent_scope_enum, nullable=True))

    # Backfill data
    connection = op.get_bind()
    system_agent_ids = [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
    ]
    connection.execute(
        sa.text("UPDATE agent SET scope = 'system' WHERE id::text = ANY(:ids)"),
        {"ids": system_agent_ids},
    )
    connection.execute(sa.text("UPDATE agent SET scope = 'user' WHERE scope IS NULL"))

    # Make column non-nullable
    op.alter_column("agent", "scope", nullable=False)

    # Make user_id nullable
    op.alter_column("agent", "user_id", existing_type=sa.VARCHAR(), nullable=True)

    # Create index
    op.create_index(op.f("ix_agent_scope"), "agent", ["scope"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agent_scope"), table_name="agent")

    # Revert user_id to non-nullable (filling nulls first)
    op.execute("UPDATE agent SET user_id = 'system' WHERE user_id IS NULL")
    op.alter_column("agent", "user_id", existing_type=sa.VARCHAR(), nullable=False)

    op.drop_column("agent", "scope")

    sa.Enum(name="agentscope").drop(op.get_bind(), checkfirst=True)
