"""modify provider_id with SET NULL

Revision ID: 1a3d49a2b233
Revises: c2cc96481a4a
Create Date: 2025-10-18 21:04:58.861567

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1a3d49a2b233"
down_revision: Union[str, Sequence[str], None] = "c2cc96481a4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Note: This migration modifies the foreign key constraint on agent.provider_id
    to add ondelete='SET NULL'. The model definition now includes this, so when
    Alembic compares schemas, it will detect the change.

    For SQLite: The foreign key constraint is defined in the model's sa_column,
    so no explicit migration is needed - the constraint will be applied when
    the table is created fresh or when using render_as_batch=True in env.py.

    For PostgreSQL: Alembic can alter constraints directly.
    """
    # Check database type
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite: Foreign key constraints can't be altered directly
        # The new constraint is defined in the model, so it will be used
        # when batch operations recreate the table
        pass
    else:
        # PostgreSQL: Can alter constraint directly
        with op.batch_alter_table("agent", schema=None) as batch_op:
            batch_op.drop_constraint("agent_provider_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key(
                "agent_provider_id_fkey", "provider", ["provider_id"], ["id"], ondelete="SET NULL"
            )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite: No action needed
        pass
    else:
        # PostgreSQL: Revert constraint
        with op.batch_alter_table("agent", schema=None) as batch_op:
            batch_op.drop_constraint("agent_provider_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key("agent_provider_id_fkey", "provider", ["provider_id"], ["id"])
