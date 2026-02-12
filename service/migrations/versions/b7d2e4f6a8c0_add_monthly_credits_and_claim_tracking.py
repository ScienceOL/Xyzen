"""add monthly credits and claim tracking

Revision ID: b7d2e4f6a8c0
Revises: a3b1c9e2d4f6
Create Date: 2026-02-11 20:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7d2e4f6a8c0"
down_revision: Union[str, Sequence[str], None] = "a3b1c9e2d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add monthly_credits to subscriptionrole
    op.add_column(
        "subscriptionrole",
        sa.Column("monthly_credits", sa.Integer(), nullable=False, server_default="0"),
    )
    # Add last_credits_claimed_at to usersubscription
    op.add_column(
        "usersubscription",
        sa.Column("last_credits_claimed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # Seed monthly credit amounts per tier
    op.execute("UPDATE subscriptionrole SET monthly_credits = 0 WHERE name = 'free'")
    op.execute("UPDATE subscriptionrole SET monthly_credits = 5000 WHERE name = 'standard'")
    op.execute("UPDATE subscriptionrole SET monthly_credits = 22000 WHERE name = 'professional'")
    op.execute("UPDATE subscriptionrole SET monthly_credits = 60000 WHERE name = 'ultra'")


def downgrade() -> None:
    op.drop_column("usersubscription", "last_credits_claimed_at")
    op.drop_column("subscriptionrole", "monthly_credits")
