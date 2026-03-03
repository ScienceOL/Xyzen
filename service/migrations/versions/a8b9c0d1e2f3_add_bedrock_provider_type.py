"""add bedrock provider type

Revision ID: a8b9c0d1e2f3
Revises: 77143cca9539
Create Date: 2026-03-03 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "77143cca9539"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add 'bedrock' to the providertype enum."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'bedrock'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'providertype')
                ) THEN
                    ALTER TYPE providertype ADD VALUE 'bedrock';
                END IF;
            END$$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL does not support removing enum values directly.
    pass
