"""Gift campaign models for extensible reward campaigns."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


class GiftCampaignBase(SQLModel):
    """Base model for gift campaign with shared fields."""

    name: str = Field(unique=True, index=True, description="Unique campaign identifier")
    display_name_key: str = Field(description="i18n key for display name")
    description_key: str = Field(description="i18n key for description")
    mode: str = Field(description="Handler identifier (e.g. 'daily_credits_with_unlock')")
    config: dict = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default=text("'{}'")))
    total_days: int = Field(description="Total campaign duration in days")
    starts_at: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Campaign start date",
    )
    ends_at: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Campaign end date",
    )
    is_active: bool = Field(default=True, description="Whether the campaign is active")


class GiftCampaign(GiftCampaignBase, table=True):
    """Gift campaign table."""

    __tablename__ = "gift_campaigns"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class GiftCampaignRead(GiftCampaignBase):
    """Schema for reading a gift campaign."""

    id: UUID = Field(description="Campaign ID")
    created_at: datetime = Field(description="Creation time")
    updated_at: datetime = Field(description="Last update time")


class GiftClaimBase(SQLModel):
    """Base model for gift claim with shared fields."""

    user_id: str = Field(index=True, description="User who claimed")
    campaign_id: UUID = Field(index=True, description="Campaign ID")
    day_number: int = Field(description="Day number in campaign (1-indexed)")
    consecutive_days: int = Field(description="Consecutive streak at claim time")
    reward_data: dict = Field(
        default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default=text("'{}'"))
    )


class GiftClaim(GiftClaimBase, table=True):
    """Gift claim record table."""

    __tablename__ = "gift_claims"  # type: ignore
    __table_args__ = (Index("idx_gift_claim_user_campaign_day", "user_id", "campaign_id", "day_number", unique=True),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    claimed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class GiftClaimRead(GiftClaimBase):
    """Schema for reading a gift claim."""

    id: UUID = Field(description="Claim ID")
    claimed_at: datetime = Field(description="Claim time")


class GiftClaimCreate(SQLModel):
    """Schema for creating a gift claim."""

    user_id: str = Field(description="User ID")
    campaign_id: UUID = Field(description="Campaign ID")
    day_number: int = Field(description="Day number (1-indexed)")
    consecutive_days: int = Field(description="Consecutive streak at claim time")
    reward_data: dict = Field(default_factory=dict, description="What was given")
