"""merge migration heads

Revision ID: e8b677d1381b
Revises: 6fe5e1d63039, e2f4b6c8d0a1
Create Date: 2026-02-19 21:06:14.050849

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e8b677d1381b'
down_revision: Union[str, Sequence[str], None] = ('6fe5e1d63039', 'e2f4b6c8d0a1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
