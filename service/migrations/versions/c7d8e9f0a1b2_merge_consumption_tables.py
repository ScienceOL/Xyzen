"""merge consumption tables into consumerecord

Drop LLMUsageRecord, ToolCallRecord, DailyConsumeSummary tables.
Add new columns to ConsumeRecord for unified tracking.
Remove old columns no longer needed.
Add cost_usd column.

Revision ID: c7d8e9f0a1b2
Revises: b1c2d3e4f5a6
Create Date: 2026-02-21 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new columns to consumerecord
    op.add_column("consumerecord", sa.Column("record_type", sa.String(), nullable=False, server_default="llm"))
    op.add_column("consumerecord", sa.Column("provider", sa.String(), nullable=True))
    op.add_column(
        "consumerecord",
        sa.Column("cache_creation_input_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "consumerecord",
        sa.Column("cache_read_input_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("consumerecord", sa.Column("source", sa.String(), nullable=True, server_default="chat"))
    op.add_column("consumerecord", sa.Column("tool_name", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("tool_call_id", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("status", sa.String(), nullable=False, server_default="success"))

    # 2. Back-fill existing records as LLM type
    op.execute("UPDATE consumerecord SET record_type = 'llm' WHERE record_type IS NULL")

    # 3. Drop old columns that are no longer needed
    op.drop_column("consumerecord", "biz_no")
    op.drop_column("consumerecord", "sku_id")
    op.drop_column("consumerecord", "scene")
    op.drop_column("consumerecord", "tier_rate")
    op.drop_column("consumerecord", "calculation_breakdown")
    op.drop_column("consumerecord", "tool_call_count")
    op.drop_column("consumerecord", "remote_error")
    op.drop_column("consumerecord", "remote_response")

    # 4. Adjust amount default to 0 (was nullable before)
    op.alter_column("consumerecord", "amount", server_default="0", nullable=False)

    # 5. Add new indexes
    op.create_index(
        "idx_consumerecord_session_topic",
        "consumerecord",
        ["session_id", "topic_id"],
    )

    # 5b. Add cost columns
    op.add_column(
        "consumerecord",
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0.0"),
    )

    # 6. Drop legacy tables
    op.drop_index("idx_llmusagerecord_user_created", table_name="llmusagerecord")
    op.drop_table("llmusagerecord")

    op.drop_index("idx_toolcallrecord_user_created", table_name="toolcallrecord")
    op.drop_table("toolcallrecord")

    op.drop_index("idx_dailyconsumesummary_user_date", table_name="dailyconsumesummary")
    op.drop_constraint("uq_dailyconsumesummary_user_date", table_name="dailyconsumesummary")
    op.drop_table("dailyconsumesummary")


def downgrade() -> None:
    # Drop cost column (added in step 5b)
    op.drop_column("consumerecord", "cost_usd")

    # Recreate legacy tables
    op.create_table(
        "llmusagerecord",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("topic_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("model_name", sa.String(), nullable=False),
        sa.Column("model_tier", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_creation_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_read_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(), nullable=False, server_default="chat"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index("idx_llmusagerecord_user_created", "llmusagerecord", ["user_id", "created_at"])

    op.create_table(
        "toolcallrecord",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("topic_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("tool_name", sa.String(), nullable=False),
        sa.Column("tool_call_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="success"),
        sa.Column("model_tier", sa.String(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index("idx_toolcallrecord_user_created", "toolcallrecord", ["user_id", "created_at"])

    op.create_table(
        "dailyconsumesummary",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("tz", sa.String(), nullable=False, server_default="Asia/Shanghai"),
        sa.Column("total_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_credits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("llm_call_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tool_call_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("by_tier", sa.JSON(), nullable=True),
        sa.Column("by_model", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index("idx_dailyconsumesummary_user_date", "dailyconsumesummary", ["user_id", "date"])
    op.create_unique_constraint("uq_dailyconsumesummary_user_date", "dailyconsumesummary", ["user_id", "date"])

    # Drop new index
    op.drop_index("idx_consumerecord_session_topic", table_name="consumerecord")

    # Add back old columns
    op.add_column("consumerecord", sa.Column("biz_no", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("sku_id", sa.Integer(), nullable=True))
    op.add_column("consumerecord", sa.Column("scene", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("tier_rate", sa.Float(), nullable=True))
    op.add_column("consumerecord", sa.Column("calculation_breakdown", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("tool_call_count", sa.Integer(), nullable=True))
    op.add_column("consumerecord", sa.Column("remote_error", sa.String(), nullable=True))
    op.add_column("consumerecord", sa.Column("remote_response", sa.String(), nullable=True))

    # Drop new columns
    op.drop_column("consumerecord", "record_type")
    op.drop_column("consumerecord", "provider")
    op.drop_column("consumerecord", "cache_creation_input_tokens")
    op.drop_column("consumerecord", "cache_read_input_tokens")
    op.drop_column("consumerecord", "source")
    op.drop_column("consumerecord", "tool_name")
    op.drop_column("consumerecord", "tool_call_id")
    op.drop_column("consumerecord", "status")
