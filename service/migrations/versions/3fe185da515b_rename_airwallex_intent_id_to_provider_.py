"""rename airwallex_intent_id to provider_order_id

Revision ID: 3fe185da515b
Revises: 17aacd78562f
Create Date: 2026-02-28 22:04:01.532623

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "3fe185da515b"
down_revision: Union[str, Sequence[str], None] = "17aacd78562f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "payment_orders",
        "airwallex_intent_id",
        new_column_name="provider_order_id",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "payment_orders",
        "provider_order_id",
        new_column_name="airwallex_intent_id",
    )
