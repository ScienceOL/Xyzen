from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, BigInteger, Index
from sqlmodel import Column, Field, SQLModel


class ConsumeRecordBase(SQLModel):
    """Base model for consume record with shared fields."""

    # Historical note: Fields removed in migration c7d8e9f0a1b2:
    # - biz_no (billing idempotency key, replaced by UUID pk)
    # - sku_id (product type, replaced by record_type + model_name/tool_name)
    # - scene (consumption scene, replaced by source field)
    # - tier_rate (stored multiplier, now computed from model_tier via TIER_MODEL_CONSUMPTION_RATE)
    # - calculation_breakdown (JSON calc details, now reproducible via pricing.py)
    # - tool_call_count (per-record tool count, now each tool is a separate record)
    # - remote_error / remote_response (external billing API, no longer used)

    # Type identifier
    record_type: str = Field(description="Record type: llm | tool_call")

    # Context
    user_id: str = Field(index=True, description="User ID from authentication provider")
    auth_provider: str = Field(index=True, description="Authentication provider (e.g. bohr_app)")
    session_id: UUID | None = Field(default=None, description="Associated session ID")
    topic_id: UUID | None = Field(default=None, description="Associated topic ID")
    message_id: UUID | None = Field(default=None, index=True, description="Associated message ID")
    model_tier: str | None = Field(default=None, description="Model tier used (ultra/pro/standard/lite)")

    # Credits
    amount: int = Field(default=0, description="Credit consumption for this record")
    consume_state: str = Field(default="pending", description="Consumption state: pending/success/failed")

    # Platform cost (USD) — calculated when the record is created
    cost_usd: float = Field(default=0.0, description="Real platform cost in USD for this record")

    # LLM fields (None when record_type="tool_call")
    model_name: str | None = Field(default=None, description="Actual model name used (e.g. gemini-3-pro-preview)")
    provider: str | None = Field(default=None, description="Provider identifier (google, anthropic, qwen...)")
    input_tokens: int = Field(default=0, description="Number of input tokens used")
    output_tokens: int = Field(default=0, description="Number of output tokens generated")
    total_tokens: int = Field(default=0, description="Total tokens (input + output)")
    cache_creation_input_tokens: int = Field(default=0, description="Tokens written to cache (Anthropic)")
    cache_read_input_tokens: int = Field(default=0, description="Tokens read from cache (Anthropic)")
    source: str = Field(
        default="chat",
        description="Origin: chat | subagent | delegation | tool:generate_image | tool:read_image | topic_rename | model_selection",
    )

    # Tool fields (None when record_type="llm")
    tool_name: str | None = Field(default=None, description="Tool name (generate_image, web_search, ...)")
    tool_call_id: str | None = Field(default=None, description="LLM-assigned tool_call_id")
    status: str = Field(default="success", description="Tool execution status: success | error")

    # General
    description: str | None = Field(default=None, description="Consumption description")


class ConsumeRecord(ConsumeRecordBase, table=True):
    """Consumption record table - records each LLM call / tool call"""

    __table_args__ = (
        Index("idx_consumerecord_user_created", "user_id", "created_at"),
        Index("idx_consumerecord_session_topic", "session_id", "topic_id"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)

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
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


class ConsumeRecordUpdate(SQLModel):
    """Schema for updating a consume record. All fields are optional."""

    amount: int | None = Field(default=None, description="Credit consumption amount")
    consume_state: str | None = Field(default=None, description="Consumption state: pending/success/failed")
    message_id: UUID | None = Field(default=None, description="Associated message ID")
    description: str | None = Field(default=None, description="Consumption description")


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
