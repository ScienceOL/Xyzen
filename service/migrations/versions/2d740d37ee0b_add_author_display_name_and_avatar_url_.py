"""add author display name and avatar url to marketplace

Revision ID: 2d740d37ee0b
Revises: dd33881847e9
Create Date: 2026-02-10 16:09:53.663900

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = "2d740d37ee0b"
down_revision: Union[str, Sequence[str], None] = "dd33881847e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "agentmarketplace", sa.Column("author_display_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
    )
    op.add_column("agentmarketplace", sa.Column("author_avatar_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("agentmarketplace", "author_avatar_url")
    op.drop_column("agentmarketplace", "author_display_name")
