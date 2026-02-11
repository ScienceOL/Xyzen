"""add max_model_tier to subscriptionrole

Revision ID: c4e8f1a2b5d7
Revises: b7d2e4f6a8c0
Create Date: 2026-02-12 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e8f1a2b5d7"
down_revision: Union[str, Sequence[str], None] = "b7d2e4f6a8c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscriptionrole",
        sa.Column("max_model_tier", sa.String(), nullable=False, server_default="lite"),
    )

    # Seed tier limits per subscription role
    op.execute("UPDATE subscriptionrole SET max_model_tier = 'lite' WHERE name = 'free'")
    op.execute("UPDATE subscriptionrole SET max_model_tier = 'standard' WHERE name = 'standard'")
    op.execute("UPDATE subscriptionrole SET max_model_tier = 'pro' WHERE name = 'professional'")
    op.execute("UPDATE subscriptionrole SET max_model_tier = 'ultra' WHERE name = 'ultra'")


def downgrade() -> None:
    op.drop_column("subscriptionrole", "max_model_tier")
