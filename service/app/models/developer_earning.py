from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, BigInteger, Index
from sqlmodel import Column, Field, SQLModel


# ==================== DeveloperEarning Models ====================


class DeveloperEarningBase(SQLModel):
    """Base model for developer earning records."""

    developer_user_id: str = Field(index=True, description="Developer (marketplace publisher) user ID")
    marketplace_id: UUID = Field(index=True, description="Marketplace listing that generated this earning")
    consumer_user_id: str = Field(index=True, description="User who consumed the agent")
    session_id: UUID | None = Field(default=None, description="Session where consumption occurred")
    topic_id: UUID | None = Field(default=None, description="Topic where consumption occurred")
    message_id: UUID | None = Field(default=None, description="Message that triggered this earning")

    fork_mode: str = Field(description="Fork mode at earning time: editable | locked")
    rate: float = Field(description="Revenue share rate applied (e.g. 0.30 or 0.03)")
    amount: int = Field(default=0, description="Credits earned by developer")
    total_consumed: int = Field(default=0, description="Total credits consumed by user for this settlement")

    status: str = Field(default="settled", index=True, description="Earning status: settled | failed")


class DeveloperEarning(DeveloperEarningBase, table=True):
    """Developer earning record — one row per settlement event."""

    __table_args__ = (
        Index("idx_devearning_developer_created", "developer_user_id", "created_at"),
        Index("idx_devearning_marketplace_created", "marketplace_id", "created_at"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class DeveloperEarningCreate(DeveloperEarningBase):
    """Schema for creating a developer earning record."""

    pass


class DeveloperEarningRead(DeveloperEarningBase):
    """Schema for reading a developer earning record."""

    id: UUID
    created_at: datetime


# ==================== DeveloperWallet Models ====================


class DeveloperWalletBase(SQLModel):
    """Base model for developer wallet."""

    developer_user_id: str = Field(unique=True, index=True, description="Developer user ID")
    available_balance: int = Field(default=0, sa_type=BigInteger, description="Balance available for withdrawal")
    total_earned: int = Field(default=0, sa_type=BigInteger, description="Lifetime earnings")
    total_withdrawn: int = Field(default=0, sa_type=BigInteger, description="Lifetime withdrawals to UserWallet")


class DeveloperWallet(DeveloperWalletBase, table=True):
    """Developer wallet — tracks earnings from marketplace agent usage."""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class DeveloperWalletCreate(SQLModel):
    """Schema for creating a developer wallet."""

    developer_user_id: str


class DeveloperWalletRead(DeveloperWalletBase):
    """Schema for reading a developer wallet."""

    id: UUID
    created_at: datetime
    updated_at: datetime
