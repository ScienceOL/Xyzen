"""add max_scheduled_tasks to subscriptionrole

Revision ID: a3f7b2c1d4e8
Revises: 7feda3a245ad
Create Date: 2026-02-25 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3f7b2c1d4e8"
down_revision: Union[str, None] = "7feda3a245ad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscriptionrole",
        sa.Column("max_scheduled_tasks", sa.Integer(), nullable=False, server_default="0"),
    )
    # Seed tier limits
    op.execute("UPDATE subscriptionrole SET max_scheduled_tasks = 3 WHERE name = 'standard'")
    op.execute("UPDATE subscriptionrole SET max_scheduled_tasks = 6 WHERE name = 'professional'")
    op.execute("UPDATE subscriptionrole SET max_scheduled_tasks = 10 WHERE name = 'ultra'")


def downgrade() -> None:
    op.drop_column("subscriptionrole", "max_scheduled_tasks")
