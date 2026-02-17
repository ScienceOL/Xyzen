"""Web Push subscription model."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Index
from sqlmodel import Column, Field, SQLModel


class PushSubscription(SQLModel, table=True):
    """Browser Push API subscription — one per browser per user."""

    __tablename__ = "push_subscription"  # type: ignore
    __table_args__ = (Index("idx_push_sub_endpoint", "endpoint", unique=True),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="Logical user reference (no FK)")
    endpoint: str = Field(description="Browser Push Service URL")
    keys_p256dh: str = Field(description="P-256 ECDH public key")
    keys_auth: str = Field(description="Authentication secret")
    user_agent: str = Field(default="", description="Optional device identifier")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
