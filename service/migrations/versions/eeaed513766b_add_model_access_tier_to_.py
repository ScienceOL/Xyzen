"""add model_access_tier to usersubscription

Revision ID: eeaed513766b
Revises: faf1e2e38675
Create Date: 2026-03-04 01:41:22.362102

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "eeaed513766b"
down_revision: Union[str, Sequence[str], None] = "faf1e2e38675"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "usersubscription",
        sa.Column(
            "model_access_tier",
            sqlmodel.sql.sqltypes.AutoString(),
            server_default="ultra",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("usersubscription", "model_access_tier")
