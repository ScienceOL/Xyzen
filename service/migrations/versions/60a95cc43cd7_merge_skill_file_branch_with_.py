"""merge skill/file branch with marketplace author branch

Revision ID: 60a95cc43cd7
Revises: d86c15db8c44, 2d740d37ee0b
Create Date: 2026-02-10 22:07:59.414336

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '60a95cc43cd7'
down_revision: Union[str, Sequence[str], None] = ('d86c15db8c44', '2d740d37ee0b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
