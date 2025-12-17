"""add_avatar_background_color_to_agent

Revision ID: f1b2c3d4e5f6
Revises: 345d4e5e7ec4
Create Date: 2025-12-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "345d4e5e7ec4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - add avatar_background_color field to agent table."""
    op.add_column(
        "agent",
        sa.Column(
            "avatar_background_color",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
            comment="Avatar background color in hex format",
        ),
    )


def downgrade() -> None:
    """Downgrade schema - remove avatar_background_color field from agent table."""
    op.drop_column("agent", "avatar_background_color")
