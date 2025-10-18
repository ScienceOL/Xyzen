"""Add is_system field to provider table

Revision ID: fd17b4979d60
Revises: 1a3d49a2b233
Create Date: 2025-10-18 21:30:41.198481

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd17b4979d60"
down_revision: Union[str, Sequence[str], None] = "1a3d49a2b233"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add is_system column to provider table
    with op.batch_alter_table("provider", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_system", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.create_index("ix_provider_is_system", ["is_system"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Remove is_system column from provider table
    with op.batch_alter_table("provider", schema=None) as batch_op:
        batch_op.drop_index("ix_provider_is_system")
        batch_op.drop_column("is_system")
