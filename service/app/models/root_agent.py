"""Root Agent model — ensures each user has exactly one CEO/root agent."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, UniqueConstraint
from sqlmodel import Column, Field, SQLModel


class RootAgent(SQLModel, table=True):
    __tablename__ = "root_agent"  # type: ignore
    __table_args__ = (UniqueConstraint("user_id", name="uq_root_agent_user_id"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, nullable=False)
    agent_id: UUID = Field(index=True, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class RootAgentRead(SQLModel):
    id: UUID
    user_id: str
    agent_id: UUID
    created_at: datetime
    updated_at: datetime
