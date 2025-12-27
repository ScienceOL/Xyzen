"""Check-in models for daily sign-in rewards system."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Index
from sqlmodel import Column, Field, SQLModel


class CheckInBase(SQLModel):
    """Base model for check-in with shared fields."""

    user_id: str = Field(index=True, description="User ID who checked in")
    check_in_date: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="Date of check-in (should be normalized to start of day)",
    )
    consecutive_days: int = Field(default=1, description="Number of consecutive check-in days at the time")
    points_awarded: int = Field(description="Points awarded for this check-in")


class CheckIn(CheckInBase, table=True):
    """Check-in record table - stores daily check-in records."""

    __tablename__ = "check_ins"  # type: ignore
    __table_args__ = (
        # Ensure one check-in per user per day
        Index("idx_user_date", "user_id", "check_in_date", unique=True),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class CheckInRead(CheckInBase):
    """Schema for reading a check-in record."""

    id: UUID = Field(description="Unique identifier for this check-in")
    created_at: datetime = Field(description="Creation time")


class CheckInCreate(SQLModel):
    """Schema for creating a check-in record."""

    user_id: str = Field(description="User ID who is checking in")
    check_in_date: datetime = Field(description="Date of check-in")
    consecutive_days: int = Field(description="Number of consecutive days")
    points_awarded: int = Field(description="Points awarded")
