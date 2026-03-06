"""Beta survey models for collecting user feedback during beta period."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class BetaSurveyBase(SQLModel):
    """Base model for beta survey with shared fields."""

    user_id: str | None = Field(default=None, index=True, description="User ID (nullable for anonymous surveys)")
    discovery_channel: str = Field(description="How they learned about Xyzen")
    occupation: str = Field(description="Primary occupation")
    problem_to_solve: str = Field(description="What they hope Xyzen solves")


class BetaSurvey(BetaSurveyBase, table=True):
    """Beta survey record table."""

    __tablename__ = "beta_surveys"  # type: ignore

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class BetaSurveyCreate(BetaSurveyBase):
    """Schema for creating a beta survey."""

    pass


class BetaSurveyRead(BetaSurveyBase):
    """Schema for reading a beta survey."""

    id: UUID
    created_at: datetime
