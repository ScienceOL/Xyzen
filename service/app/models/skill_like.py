from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class SkillLike(SQLModel, table=True):
    """User likes on skill marketplace listings."""

    user_id: str = Field(primary_key=True, index=True, description="User who liked the skill")
    skill_marketplace_id: UUID = Field(primary_key=True, index=True, description="Skill marketplace listing ID")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class SkillLikeCreate(SQLModel):
    """Model for creating a skill like."""

    skill_marketplace_id: UUID


class SkillLikeRead(SQLModel):
    """Model for reading skill like information."""

    user_id: str
    skill_marketplace_id: UUID
    created_at: datetime
