from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import Field, SQLModel


class AgentLike(SQLModel, table=True):
    """User likes on marketplace listings"""

    user_id: str = Field(primary_key=True, index=True, description="User who liked the agent")
    marketplace_id: UUID = Field(primary_key=True, index=True, description="Marketplace listing ID")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class AgentLikeCreate(SQLModel):
    """Model for creating a like"""

    marketplace_id: UUID


class AgentLikeRead(SQLModel):
    """Model for reading like information"""

    user_id: str
    marketplace_id: UUID
    created_at: datetime
