"""Add bedrock to providertype enum

Revision ID: eb1a03995023
Revises: eeaed513766b
Create Date: 2026-03-04 21:43:48.030409

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "eb1a03995023"
down_revision: Union[str, Sequence[str], None] = "eeaed513766b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ALTER TYPE ADD VALUE cannot run inside a regular transaction block;
    # execute it with AUTOCOMMIT isolation.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE providertype ADD VALUE IF NOT EXISTS 'bedrock'")


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL does not support removing enum values; no-op.
    pass
