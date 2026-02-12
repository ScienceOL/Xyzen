"""Remove SYSTEM_USER_ID from legacy agent

Revision ID: dd33881847e9
Revises: 2f71cc102cc8
Create Date: 2026-02-07 22:35:54.832942

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "dd33881847e9"
down_revision: Union[str, Sequence[str], None] = "2f71cc102cc8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Null out user_id for legacy agent rows that used the hardcoded SYSTEM_USER_ID."""
    op.execute(
        "UPDATE agent SET user_id = NULL WHERE user_id = 'da2a8078-dd7c-4052-ad68-1209c3f647f1' AND scope = 'system'"
    )


def downgrade() -> None:
    """Restore SYSTEM_USER_ID on the legacy system agent."""
    op.execute(
        "UPDATE agent SET user_id = 'da2a8078-dd7c-4052-ad68-1209c3f647f1'"
        " WHERE user_id IS NULL AND scope = 'system' AND name = '随便聊聊'"
    )
