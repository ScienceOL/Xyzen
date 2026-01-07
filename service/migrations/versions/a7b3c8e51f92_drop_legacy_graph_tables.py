"""drop_legacy_graph_tables

Revision ID: a7b3c8e51f92
Revises: d25101ce4d9a
Create Date: 2026-01-07

Drop the legacy graphagent, graphnode, and graphedge tables.
These tables are replaced by the new graph_config JSON field in the agent table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b3c8e51f92"
down_revision: Union[str, Sequence[str], None] = "d25101ce4d9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop legacy graph tables."""
    # Drop graphnode table and its indexes
    op.drop_index(op.f("ix_graphnode_id"), table_name="graphnode")
    op.drop_index(op.f("ix_graphnode_graph_agent_id"), table_name="graphnode")
    op.drop_table("graphnode")

    # Drop graphedge table and its indexes
    op.drop_index(op.f("ix_graphedge_to_node_id"), table_name="graphedge")
    op.drop_index(op.f("ix_graphedge_id"), table_name="graphedge")
    op.drop_index(op.f("ix_graphedge_graph_agent_id"), table_name="graphedge")
    op.drop_index(op.f("ix_graphedge_from_node_id"), table_name="graphedge")
    op.drop_table("graphedge")

    # Drop graphagent table and its indexes
    op.drop_index(op.f("ix_graphagent_user_id"), table_name="graphagent")
    op.drop_index(op.f("ix_graphagent_parent_agent_id"), table_name="graphagent")
    op.drop_index(op.f("ix_graphagent_id"), table_name="graphagent")
    # Drop is_published and is_official columns if they exist (added in later migrations)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col["name"] for col in inspector.get_columns("graphagent")]
    if "is_published" in columns:
        op.drop_index(op.f("ix_graphagent_is_published"), table_name="graphagent")
    if "is_official" in columns:
        op.drop_index(op.f("ix_graphagent_is_official"), table_name="graphagent")
    op.drop_table("graphagent")


def downgrade() -> None:
    """Recreate legacy graph tables (for rollback)."""
    # Recreate graphagent table
    op.create_table(
        "graphagent",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("state_schema", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("parent_agent_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_graphagent_id"), "graphagent", ["id"], unique=False)
    op.create_index(op.f("ix_graphagent_parent_agent_id"), "graphagent", ["parent_agent_id"], unique=False)
    op.create_index(op.f("ix_graphagent_user_id"), "graphagent", ["user_id"], unique=False)
    op.create_index(op.f("ix_graphagent_is_published"), "graphagent", ["is_published"], unique=False)
    op.create_index(op.f("ix_graphagent_is_official"), "graphagent", ["is_official"], unique=False)

    # Recreate graphedge table
    op.create_table(
        "graphedge",
        sa.Column("from_node_id", sa.Uuid(), nullable=False),
        sa.Column("to_node_id", sa.Uuid(), nullable=False),
        sa.Column("condition", sa.JSON(), nullable=True),
        sa.Column("graph_agent_id", sa.Uuid(), nullable=False),
        sa.Column("label", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_graphedge_from_node_id"), "graphedge", ["from_node_id"], unique=False)
    op.create_index(op.f("ix_graphedge_graph_agent_id"), "graphedge", ["graph_agent_id"], unique=False)
    op.create_index(op.f("ix_graphedge_id"), "graphedge", ["id"], unique=False)
    op.create_index(op.f("ix_graphedge_to_node_id"), "graphedge", ["to_node_id"], unique=False)

    # Recreate graphnode table
    op.create_table(
        "graphnode",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("node_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("graph_agent_id", sa.Uuid(), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=True),
        sa.Column("position_y", sa.Float(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_graphnode_graph_agent_id"), "graphnode", ["graph_agent_id"], unique=False)
    op.create_index(op.f("ix_graphnode_id"), "graphnode", ["id"], unique=False)
