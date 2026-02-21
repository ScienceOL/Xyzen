"""add consumption tracking tables (llm_usage_record, tool_call_record, daily_consume_summary)

Revision ID: b1c2d3e4f5a6
Revises: a1f2b3c4d5e6, 2d740d37ee0b, e2f4b6c8d0a1
Create Date: 2026-02-20 17:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = ("a1f2b3c4d5e6", "2d740d37ee0b", "e2f4b6c8d0a1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- LLMUsageRecord ---
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

    # --- ToolCallRecord ---
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

    # --- DailyConsumeSummary ---
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


def downgrade() -> None:
    op.drop_index("idx_dailyconsumesummary_user_date", table_name="dailyconsumesummary")
    op.drop_constraint("uq_dailyconsumesummary_user_date", table_name="dailyconsumesummary")
    op.drop_table("dailyconsumesummary")
    op.drop_index("idx_toolcallrecord_user_created", table_name="toolcallrecord")
    op.drop_table("toolcallrecord")
    op.drop_index("idx_llmusagerecord_user_created", table_name="llmusagerecord")
    op.drop_table("llmusagerecord")
