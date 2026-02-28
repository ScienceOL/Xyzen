"""merge subscription addon and question branches

Revision ID: eff264cc6a12
Revises: 73bab80e41de, 85f0cf9443d5
Create Date: 2026-03-01 02:48:39.880022

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "eff264cc6a12"
down_revision: Union[str, Sequence[str], None] = ("73bab80e41de", "85f0cf9443d5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
