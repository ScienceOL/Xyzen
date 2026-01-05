"""add_gpugeek_and_qwen

Revision ID: d25101ce4d9a
Revises: 03630403f8c2
Create Date: 2026-01-05 19:31:01.741842

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d25101ce4d9a"
down_revision: Union[str, Sequence[str], None] = "03630403f8c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add 'gpugeek' and 'qwen' to the providertype enum
    # PostgreSQL requires ALTER TYPE to add new enum values
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Add gpugeek if it doesn't exist
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'gpugeek'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'providertype')
                ) THEN
                    ALTER TYPE providertype ADD VALUE 'gpugeek';
                END IF;
            END$$;
            """
        )

        # Add qwen if it doesn't exist
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'qwen'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'providertype')
                ) THEN
                    ALTER TYPE providertype ADD VALUE 'qwen';
                END IF;
            END$$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    # Note: PostgreSQL does not support removing enum values directly
    # This would require recreating the enum type, which is complex
    # For safety, we'll leave the enum values in place
    # If you need to remove them, you'll need to:
    # 1. Create a new enum without these values
    # 2. Migrate all data
    # 3. Drop the old enum and rename the new one
    pass
