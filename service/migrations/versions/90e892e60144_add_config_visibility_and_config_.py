"""Add config_visibility and config_editable to Agent, fork_mode to Marketplace

Revision ID: 90e892e60144
Revises: f5e0d3529c12
Create Date: 2026-01-24 22:08:02.944553

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "90e892e60144"
down_revision: Union[str, Sequence[str], None] = "f5e0d3529c12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create enum types first (PostgreSQL requires this)
    config_visibility_enum = sa.Enum("visible", "hidden", name="configvisibility")
    config_visibility_enum.create(op.get_bind(), checkfirst=True)

    fork_mode_enum = sa.Enum("editable", "locked", name="forkmode")
    fork_mode_enum.create(op.get_bind(), checkfirst=True)

    # Add columns to agent table
    op.add_column(
        "agent",
        sa.Column(
            "config_visibility",
            config_visibility_enum,
            server_default="visible",
            nullable=False,
        ),
    )
    op.add_column(
        "agent",
        sa.Column("config_editable", sa.Boolean(), server_default="true", nullable=False),
    )

    # Add column to agentmarketplace table
    op.add_column(
        "agentmarketplace",
        sa.Column(
            "fork_mode",
            fork_mode_enum,
            server_default="editable",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop columns first
    op.drop_column("agentmarketplace", "fork_mode")
    op.drop_column("agent", "config_editable")
    op.drop_column("agent", "config_visibility")

    # Then drop enum types
    sa.Enum(name="forkmode").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="configvisibility").drop(op.get_bind(), checkfirst=True)
