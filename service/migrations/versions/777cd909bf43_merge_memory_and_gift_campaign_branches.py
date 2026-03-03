"""Merge memory and gift campaign branches

Revision ID: 777cd909bf43
Revises: a202af9b7a5b, faf1e2e38675
Create Date: 2026-03-04 00:35:55.228354

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '777cd909bf43'
down_revision: Union[str, Sequence[str], None] = ('a202af9b7a5b', 'faf1e2e38675')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
