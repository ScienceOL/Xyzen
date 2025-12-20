"""avator and share agent

Revision ID: 4a6df56b831a
Revises: 32960112cc33, 3d5e4ae2bc9b
Create Date: 2025-12-20 16:17:39.912871

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "4a6df56b831a"
down_revision: Union[str, Sequence[str], None] = ("32960112cc33", "3d5e4ae2bc9b")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
