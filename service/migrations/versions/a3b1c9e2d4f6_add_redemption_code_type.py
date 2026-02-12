"""add redemption code type

Revision ID: a3b1c9e2d4f6
Revises: 17c153d0d131
Create Date: 2026-02-11 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3b1c9e2d4f6"
down_revision: Union[str, Sequence[str], None] = "17c153d0d131"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add code_type, role_name, duration_days columns to redemptioncode table."""
    op.add_column(
        "redemptioncode",
        sa.Column("code_type", sa.String(), server_default="credits", nullable=False),
    )
    op.add_column(
        "redemptioncode",
        sa.Column("role_name", sa.String(), nullable=True),
    )
    op.add_column(
        "redemptioncode",
        sa.Column("duration_days", sa.Integer(), server_default="30", nullable=False),
    )


def downgrade() -> None:
    """Remove code_type, role_name, duration_days columns from redemptioncode table."""
    op.drop_column("redemptioncode", "duration_days")
    op.drop_column("redemptioncode", "role_name")
    op.drop_column("redemptioncode", "code_type")
