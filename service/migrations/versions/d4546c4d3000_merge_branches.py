"""merge branches

Revision ID: d4546c4d3000
Revises: 791bfece478d, f1b2c3d4e5f6
Create Date: 2025-12-16 18:24:30.530443

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "d4546c4d3000"
down_revision: Union[str, Sequence[str], None] = ("791bfece478d", "f1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
