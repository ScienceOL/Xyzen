"""Add PaymentOrder and SandboxProfile tables, fix consumerecord nullability, drop stale session indexes

Revision ID: 5480c1ec7b70
Revises: 678f52c43f41
Create Date: 2026-02-24 13:10:01.120114

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "5480c1ec7b70"
down_revision: Union[str, Sequence[str], None] = "678f52c43f41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # -- 1. New tables --

    op.create_table(
        "payment_orders",
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("order_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("plan_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("credits_amount", sa.Integer(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("payment_method", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("airwallex_intent_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("qr_code_url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("fulfilled", sa.Boolean(), nullable=False),
        sa.Column("fulfilled_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_orders_id"), "payment_orders", ["id"], unique=False)
    op.create_index(op.f("ix_payment_orders_user_id"), "payment_orders", ["user_id"], unique=False)

    op.create_table(
        "sandbox_profiles",
        sa.Column("cpu", sa.Integer(), nullable=True),
        sa.Column("memory", sa.Integer(), nullable=True),
        sa.Column("disk", sa.Integer(), nullable=True),
        sa.Column("auto_stop_minutes", sa.Integer(), nullable=True),
        sa.Column("auto_delete_minutes", sa.Integer(), nullable=True),
        sa.Column("timeout", sa.Integer(), nullable=True),
        sa.Column("image", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sandbox_profiles_id"), "sandbox_profiles", ["id"], unique=False)
    op.create_index(op.f("ix_sandbox_profiles_user_id"), "sandbox_profiles", ["user_id"], unique=True)

    # -- 2. Fix consumerecord: backfill NULLs to 0 then set NOT NULL --
    # These columns were added nullable but the model defines default=0 / default="chat".
    # 66 rows (tool_call records) have NULL token counts.

    op.execute("UPDATE consumerecord SET input_tokens = 0 WHERE input_tokens IS NULL")
    op.execute("UPDATE consumerecord SET output_tokens = 0 WHERE output_tokens IS NULL")
    op.execute("UPDATE consumerecord SET total_tokens = 0 WHERE total_tokens IS NULL")
    op.execute("UPDATE consumerecord SET source = 'chat' WHERE source IS NULL")

    op.alter_column("consumerecord", "input_tokens", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("consumerecord", "output_tokens", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("consumerecord", "total_tokens", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column(
        "consumerecord",
        "source",
        existing_type=sa.VARCHAR(),
        nullable=False,
        existing_server_default=sa.text("'chat'::character varying"),
    )

    # -- 3. Drop stale session indexes --
    # Model now only defines ix_session_user_id_agent_id_unique (user_id + agent_id
    # unique where agent_id IS NOT NULL). The two legacy indexes below served the
    # same purpose but were renamed/refactored; uq_session_user_default_agent
    # (one null-agent session per user) was intentionally removed.

    op.drop_index("uq_session_user_agent_nonnull", table_name="session", postgresql_where="(agent_id IS NOT NULL)")
    op.drop_index("uq_session_user_default_agent", table_name="session", postgresql_where="(agent_id IS NULL)")


def downgrade() -> None:
    """Downgrade schema."""

    # -- 3. Restore stale session indexes --
    op.create_index(
        "uq_session_user_default_agent", "session", ["user_id"], unique=True, postgresql_where="(agent_id IS NULL)"
    )
    op.create_index(
        "uq_session_user_agent_nonnull",
        "session",
        ["user_id", "agent_id"],
        unique=True,
        postgresql_where="(agent_id IS NOT NULL)",
    )

    # -- 2. Revert consumerecord nullability (data backfill is not reversed) --
    op.alter_column(
        "consumerecord",
        "source",
        existing_type=sa.VARCHAR(),
        nullable=True,
        existing_server_default=sa.text("'chat'::character varying"),
    )
    op.alter_column("consumerecord", "total_tokens", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("consumerecord", "output_tokens", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("consumerecord", "input_tokens", existing_type=sa.INTEGER(), nullable=True)

    # -- 1. Drop new tables --
    op.drop_index(op.f("ix_sandbox_profiles_user_id"), table_name="sandbox_profiles")
    op.drop_index(op.f("ix_sandbox_profiles_id"), table_name="sandbox_profiles")
    op.drop_table("sandbox_profiles")

    op.drop_index(op.f("ix_payment_orders_user_id"), table_name="payment_orders")
    op.drop_index(op.f("ix_payment_orders_id"), table_name="payment_orders")
    op.drop_table("payment_orders")
