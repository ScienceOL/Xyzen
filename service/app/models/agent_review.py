from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column, Index, Text
from sqlmodel import Field, SQLModel


class AgentReview(SQLModel, table=True):
    """User reviews on marketplace listings (thumbs up/down + optional text)"""

    __table_args__ = (
        Index(
            "uq_agentreview_user_marketplace",
            "user_id",
            "marketplace_id",
            unique=True,
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="User who wrote the review")
    marketplace_id: UUID = Field(index=True, description="Marketplace listing ID")
    is_positive: bool = Field(description="True = recommend, False = not recommend")
    content: str | None = Field(default=None, sa_column=Column(Text, nullable=True))

    # Author info snapshot (denormalized at write time)
    author_display_name: str | None = Field(default=None, description="Author display name at review time")
    author_avatar_url: str | None = Field(default=None, description="Author avatar URL at review time")

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class AgentReviewCreate(SQLModel):
    """Model for creating a review"""

    marketplace_id: UUID
    is_positive: bool
    content: str | None = None


class AgentReviewRead(SQLModel):
    """Model for reading review information"""

    id: UUID
    user_id: str
    marketplace_id: UUID
    is_positive: bool
    content: str | None
    author_display_name: str | None
    author_avatar_url: str | None
    created_at: datetime
    updated_at: datetime
