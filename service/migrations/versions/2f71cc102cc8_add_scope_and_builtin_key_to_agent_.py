"""Add scope and builtin_key to agent_marketplace

Revision ID: 2f71cc102cc8
Revises: 5c6c342a4420
Create Date: 2026-02-07 21:57:58.206882

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "2f71cc102cc8"
down_revision: Union[str, Sequence[str], None] = "5c6c342a4420"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create the enum type first
    marketplacescope = sa.Enum("official", "community", name="marketplacescope")
    marketplacescope.create(op.get_bind(), checkfirst=True)

    op.add_column("agentmarketplace", sa.Column("scope", marketplacescope, server_default="community", nullable=False))
    op.add_column("agentmarketplace", sa.Column("builtin_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.alter_column("agentmarketplace", "user_id", existing_type=sa.VARCHAR(), nullable=True)
    op.create_index(op.f("ix_agentmarketplace_builtin_key"), "agentmarketplace", ["builtin_key"], unique=False)
    op.create_index(
        "uq_agentmarketplace_builtin_key_not_null",
        "agentmarketplace",
        ["builtin_key"],
        unique=True,
        postgresql_where=sa.text("builtin_key IS NOT NULL"),
    )
    op.create_index(op.f("ix_agentmarketplace_scope"), "agentmarketplace", ["scope"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agentmarketplace_scope"), table_name="agentmarketplace")
    op.drop_index("uq_agentmarketplace_builtin_key_not_null", table_name="agentmarketplace")
    op.drop_index(op.f("ix_agentmarketplace_builtin_key"), table_name="agentmarketplace")
    op.alter_column("agentmarketplace", "user_id", existing_type=sa.VARCHAR(), nullable=False)
    op.drop_column("agentmarketplace", "builtin_key")
    op.drop_column("agentmarketplace", "scope")

    # Drop the enum type
    sa.Enum(name="marketplacescope").drop(op.get_bind(), checkfirst=True)
