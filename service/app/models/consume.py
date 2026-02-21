from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, BigInteger, Index, UniqueConstraint
from sqlalchemy.types import JSON
from sqlmodel import Column, Field, SQLModel


class ConsumeRecordBase(SQLModel):
    """Base model for consume record with shared fields."""

    user_id: str = Field(index=True, description="User ID from authentication provider")
    amount: int = Field(description="Consumption amount")
    auth_provider: str = Field(index=True, description="Authentication provider (e.g. bohr_app)")

    # Optional business fields
    sku_id: int | None = Field(default=None, description="SKU ID")
    scene: str | None = Field(default=None, description="Consumption scene")
    session_id: UUID | None = Field(default=None, description="Associated session ID")
    topic_id: UUID | None = Field(default=None, description="Associated topic ID")
    message_id: UUID | None = Field(default=None, description="Associated message ID")
    description: str | None = Field(default=None, description="Consumption description")

    # Token usage tracking
    input_tokens: int | None = Field(default=None, description="Number of input tokens used")
    output_tokens: int | None = Field(default=None, description="Number of output tokens generated")
    total_tokens: int | None = Field(default=None, description="Total tokens (input + output)")

    # Tier-based pricing
    model_tier: str | None = Field(default=None, description="Model tier used (ultra/pro/standard/lite)")
    tier_rate: float | None = Field(default=None, description="Tier rate multiplier applied")
    calculation_breakdown: str | None = Field(default=None, description="JSON breakdown of calculation")

    # Model metadata
    model_name: str | None = Field(default=None, description="Actual model name used (e.g. gemini-3-pro-preview)")
    tool_call_count: int | None = Field(default=None, description="Number of tool calls in this request")

    # Billing status
    consume_state: str = Field(default="pending", description="Consumption state: pending/success/failed")
    remote_error: str | None = Field(default=None, description="Remote billing error information")
    remote_response: str | None = Field(default=None, description="Remote billing response")


class ConsumeRecord(ConsumeRecordBase, table=True):
    """Consumption record table - records each user's consumption details"""

    __table_args__ = (Index("idx_consumerecord_user_created", "user_id", "created_at"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    biz_no: int | None = Field(
        default=None,
        sa_column_kwargs={"autoincrement": True},
        unique=True,
        index=True,
        description="Business unique ID (for idempotency)",
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class ConsumeRecordCreate(ConsumeRecordBase):
    """Schema for creating a new consume record."""

    pass


class ConsumeRecordRead(ConsumeRecordBase):
    """Schema for reading a consume record, includes ID and timestamps."""

    id: UUID = Field(description="Unique identifier for this consume record")
    biz_no: int | None = Field(description="Business unique ID")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


class ConsumeRecordUpdate(SQLModel):
    """Schema for updating a consume record. All fields are optional."""

    amount: int | None = Field(default=None, description="Consumption amount")
    sku_id: int | None = Field(default=None, description="SKU ID")
    scene: str | None = Field(default=None, description="Consumption scene")
    session_id: UUID | None = Field(default=None, description="Associated session ID")
    topic_id: UUID | None = Field(default=None, description="Associated topic ID")
    message_id: UUID | None = Field(default=None, description="Associated message ID")
    description: str | None = Field(default=None, description="Consumption description")
    input_tokens: int | None = Field(default=None, description="Number of input tokens used")
    output_tokens: int | None = Field(default=None, description="Number of output tokens generated")
    total_tokens: int | None = Field(default=None, description="Total tokens (input + output)")
    model_tier: str | None = Field(default=None, description="Model tier used (ultra/pro/standard/lite)")
    tier_rate: float | None = Field(default=None, description="Tier rate multiplier applied")
    calculation_breakdown: str | None = Field(default=None, description="JSON breakdown of calculation")
    consume_state: str | None = Field(default=None, description="Consumption state: pending/success/failed")
    remote_error: str | None = Field(default=None, description="Remote billing error information")
    remote_response: str | None = Field(default=None, description="Remote billing response")
    model_name: str | None = Field(default=None, description="Actual model name used (e.g. gemini-3-pro-preview)")
    tool_call_count: int | None = Field(default=None, description="Number of tool calls in this request")


class UserConsumeSummaryBase(SQLModel):
    """Base model for user consume summary with shared fields."""

    user_id: str = Field(unique=True, index=True, description="User ID")
    auth_provider: str = Field(index=True, description="Authentication provider")
    total_amount: int = Field(default=0, sa_type=BigInteger, description="Total consumption amount")
    total_count: int = Field(default=0, description="Total consumption count")
    success_count: int = Field(default=0, description="Successful consumption count")
    failed_count: int = Field(default=0, description="Failed consumption count")


class UserConsumeSummary(UserConsumeSummaryBase, table=True):
    """User consumption summary table - records each user's total consumption"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class UserConsumeSummaryCreate(UserConsumeSummaryBase):
    """Schema for creating a new user consume summary."""

    pass


class UserConsumeSummaryRead(UserConsumeSummaryBase):
    """Schema for reading a user consume summary, includes ID and timestamps."""

    id: UUID = Field(description="Unique identifier for this summary")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


class UserConsumeSummaryUpdate(SQLModel):
    """Schema for updating a user consume summary. All fields are optional."""

    total_amount: int | None = Field(default=None, description="Total consumption amount")
    total_count: int | None = Field(default=None, description="Total consumption count")
    success_count: int | None = Field(default=None, description="Successful consumption count")
    failed_count: int | None = Field(default=None, description="Failed consumption count")


# ---------------------------------------------------------------------------
# LLM Usage Record — one record per LLM API call
# ---------------------------------------------------------------------------


class LLMUsageRecord(SQLModel, table=True):
    """Records each individual LLM API call's token consumption."""

    __table_args__ = (Index("idx_llmusagerecord_user_created", "user_id", "created_at"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field(index=True)
    session_id: UUID | None = Field(default=None)
    topic_id: UUID | None = Field(default=None)
    message_id: UUID | None = Field(default=None, index=True)

    # Model info
    model_name: str = Field(description="Actual model name (e.g. gemini-3-pro-preview)")
    model_tier: str | None = Field(default=None, description="Session-level tier (ultra/pro/standard/lite)")
    provider: str | None = Field(default=None, description="Provider identifier (google, anthropic, qwen...)")

    # Token consumption
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)
    cache_creation_input_tokens: int = Field(default=0, description="Tokens written to cache (Anthropic)")
    cache_read_input_tokens: int = Field(default=0, description="Tokens read from cache (Anthropic)")

    # Source identifier
    source: str = Field(
        default="chat",
        description="Origin: chat | subagent | delegation | tool:generate_image | tool:read_image | topic_rename | model_selection",
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


# ---------------------------------------------------------------------------
# Tool Call Record — one record per tool invocation
# ---------------------------------------------------------------------------


class ToolCallRecord(SQLModel, table=True):
    """Records each tool invocation for billing and analytics."""

    __table_args__ = (Index("idx_toolcallrecord_user_created", "user_id", "created_at"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field(index=True)
    session_id: UUID | None = Field(default=None)
    topic_id: UUID | None = Field(default=None)
    message_id: UUID | None = Field(default=None, index=True)

    tool_name: str = Field(description="Tool name (generate_image, web_search, ...)")
    tool_call_id: str | None = Field(default=None, description="LLM-assigned tool_call_id")
    status: str = Field(default="success", description="success | error")

    # Context (for per-tier analysis)
    model_tier: str | None = Field(default=None, description="Session-level tier")

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


# ---------------------------------------------------------------------------
# Daily Consume Summary — pre-aggregated per-user daily stats
# ---------------------------------------------------------------------------


class DailyConsumeSummary(SQLModel, table=True):
    """Pre-aggregated daily consumption statistics per user."""

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_dailyconsumesummary_user_date"),
        Index("idx_dailyconsumesummary_user_date", "user_id", "date"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field(index=True)
    date: str = Field(description="YYYY-MM-DD in the user's timezone")
    tz: str = Field(default="Asia/Shanghai", description="Timezone used for aggregation")

    # Token totals
    total_input_tokens: int = Field(default=0)
    total_output_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)

    # Credit totals
    total_credits: int = Field(default=0)

    # Call counts
    llm_call_count: int = Field(default=0)
    tool_call_count: int = Field(default=0)

    # Platform cost (cents)
    total_cost_cents: int = Field(default=0)

    # Breakdown by tier (JSON)
    by_tier: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    # Breakdown by model (JSON)
    by_model: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
