from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, BigInteger
from sqlmodel import Column, Field, SQLModel


# ==================== SubscriptionRole Models ====================


class SubscriptionRoleBase(SQLModel):
    """Base model for subscription role with shared fields."""

    name: str = Field(unique=True, index=True, description="Unique role key (e.g. 'free', 'standard')")
    display_name: str = Field(description="Human-readable role name")
    storage_limit_bytes: int = Field(sa_type=BigInteger, description="Max total storage in bytes")
    max_file_count: int = Field(description="Max number of files")
    max_file_upload_bytes: int = Field(sa_type=BigInteger, description="Max single file upload size in bytes")
    max_parallel_chats: int = Field(description="Max concurrent chat sessions")
    max_sandboxes: int = Field(description="Max sandbox instances")
    max_scheduled_tasks: int = Field(default=0, description="Max active scheduled tasks (0 = not allowed)")
    monthly_credits: int = Field(default=0, description="Monthly claimable credits for this tier")
    max_model_tier: str = Field(default="lite", description="Highest model tier allowed (lite/standard/pro/ultra)")
    is_default: bool = Field(default=False, index=True, description="Whether this is the default role")
    priority: int = Field(default=0, description="Display ordering (lower = first)")


class SubscriptionRole(SubscriptionRoleBase, table=True):
    """Subscription role table — defines resource limits per tier."""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class SubscriptionRoleCreate(SQLModel):
    """Schema for creating a subscription role."""

    name: str = Field(description="Unique role key")
    display_name: str = Field(description="Human-readable role name")
    storage_limit_bytes: int = Field(description="Max total storage in bytes")
    max_file_count: int = Field(description="Max number of files")
    max_file_upload_bytes: int = Field(description="Max single file upload size in bytes")
    max_parallel_chats: int = Field(description="Max concurrent chat sessions")
    max_sandboxes: int = Field(description="Max sandbox instances")
    max_scheduled_tasks: int = Field(default=0, description="Max active scheduled tasks (0 = not allowed)")
    monthly_credits: int = Field(default=0, description="Monthly claimable credits")
    max_model_tier: str = Field(default="lite", description="Highest model tier allowed (lite/standard/pro/ultra)")
    is_default: bool = Field(default=False, description="Whether this is the default role")
    priority: int = Field(default=0, description="Display ordering")


class SubscriptionRoleRead(SubscriptionRoleBase):
    """Schema for reading a subscription role."""

    id: UUID = Field(description="Unique identifier")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")


# ==================== UserSubscription Models ====================


class UserSubscriptionBase(SQLModel):
    """Base model for user subscription with shared fields."""

    user_id: str = Field(unique=True, index=True, description="User ID")
    role_id: UUID = Field(index=True, description="Logical reference to SubscriptionRole")
    expires_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Expiration time (null = no expiry)",
    )
    last_credits_claimed_at: datetime | None = Field(
        default=None,
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True),
        description="Last time monthly credits were claimed",
    )


class UserSubscription(UserSubscriptionBase, table=True):
    """User subscription table — binds a user to a subscription role."""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class UserSubscriptionCreate(SQLModel):
    """Schema for creating a user subscription."""

    user_id: str = Field(description="User ID")
    role_id: UUID = Field(description="Reference to SubscriptionRole")
    expires_at: datetime | None = Field(default=None, description="Expiration time")


class UserSubscriptionRead(UserSubscriptionBase):
    """Schema for reading a user subscription."""

    id: UUID = Field(description="Unique identifier")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Update time")
