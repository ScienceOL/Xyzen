"""add error fields to message

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-15 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add error_code, error_category, error_detail columns to message table."""
    op.add_column("message", sa.Column("error_code", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column("message", sa.Column("error_category", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column("message", sa.Column("error_detail", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f("ix_message_error_code"), "message", ["error_code"], unique=False)


def downgrade() -> None:
    """Remove error fields from message table."""
    op.drop_index(op.f("ix_message_error_code"), table_name="message")
    op.drop_column("message", "error_detail")
    op.drop_column("message", "error_category")
    op.drop_column("message", "error_code")
