"""add skill and agentskilllink tables

Revision ID: 68c03283fcbd
Revises: dd33881847e9
Create Date: 2026-02-09 23:24:14.456988

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "68c03283fcbd"
down_revision: Union[str, Sequence[str], None] = "dd33881847e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create skillscope enum type via raw SQL, then reference with create_type=False
    # so SA's before_create event on the table does not try to recreate it.
    op.execute("CREATE TYPE skillscope AS ENUM ('builtin', 'user')")

    op.create_table(
        "skill",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=False),
        sa.Column("scope", postgresql.ENUM("builtin", "user", name="skillscope", create_type=False), nullable=False),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("license", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("compatibility", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("resource_prefix", sqlmodel.sql.sqltypes.AutoString(length=512), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_skill_id"), "skill", ["id"], unique=False)
    op.create_index(op.f("ix_skill_name"), "skill", ["name"], unique=False)
    op.create_index(op.f("ix_skill_resource_prefix"), "skill", ["resource_prefix"], unique=False)
    op.create_index(op.f("ix_skill_scope"), "skill", ["scope"], unique=False)
    op.create_index(op.f("ix_skill_user_id"), "skill", ["user_id"], unique=False)

    op.create_table(
        "agentskilllink",
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("agent_id", "skill_id"),
    )
    op.create_index(op.f("ix_agentskilllink_agent_id"), "agentskilllink", ["agent_id"], unique=False)
    op.create_index(op.f("ix_agentskilllink_skill_id"), "agentskilllink", ["skill_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agentskilllink_skill_id"), table_name="agentskilllink")
    op.drop_index(op.f("ix_agentskilllink_agent_id"), table_name="agentskilllink")
    op.drop_table("agentskilllink")

    op.drop_index(op.f("ix_skill_user_id"), table_name="skill")
    op.drop_index(op.f("ix_skill_scope"), table_name="skill")
    op.drop_index(op.f("ix_skill_resource_prefix"), table_name="skill")
    op.drop_index(op.f("ix_skill_name"), table_name="skill")
    op.drop_index(op.f("ix_skill_id"), table_name="skill")
    op.drop_table("skill")

    op.execute("DROP TYPE IF EXISTS skillscope")
