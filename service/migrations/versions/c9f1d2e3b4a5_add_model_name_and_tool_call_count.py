"""add model_name and tool_call_count to consumerecord

Revision ID: c9f1d2e3b4a5
Revises: a5ad13fc7be3
Create Date: 2026-02-18 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel.sql.sqltypes

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9f1d2e3b4a5"
down_revision: Union[str, Sequence[str], None] = "a5ad13fc7be3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add model_name and tool_call_count columns to consumerecord."""
    op.add_column("consumerecord", sa.Column("model_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column("consumerecord", sa.Column("tool_call_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Remove model_name and tool_call_count columns from consumerecord."""
    op.drop_column("consumerecord", "tool_call_count")
    op.drop_column("consumerecord", "model_name")
