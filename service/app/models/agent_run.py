from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class AgentRunBase(SQLModel):
    """Base model for agent execution runs"""

    message_id: UUID = Field(index=True, unique=True)  # 1:1 with Message

    # Agent identification
    execution_id: str = Field(index=True)  # e.g., "exec_abc123def456"
    agent_id: str  # UUID as string
    agent_name: str
    agent_type: str  # "react", "deep_research", "graph"

    # Execution status
    status: str = "running"  # "running", "completed", "failed", "cancelled"
    started_at: float  # Unix timestamp
    ended_at: float | None = None
    duration_ms: int | None = None

    # Node execution data (JSON for flexibility)
    # Structure: { "node_outputs": {...}, "node_order": [...], "node_names": {...} }
    node_data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

    # Error info
    error_type: str | None = None
    error_message: str | None = None


class AgentRun(AgentRunBase, table=True):
    """Database model for agent execution runs"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class AgentRunCreate(AgentRunBase):
    """Model for creating an agent run"""

    pass


class AgentRunRead(AgentRunBase):
    """Model for reading an agent run"""

    id: UUID
    created_at: datetime


class AgentRunUpdate(SQLModel):
    """Model for updating an agent run"""

    status: str | None = None
    ended_at: float | None = None
    duration_ms: int | None = None
    node_data: dict[str, Any] | None = None
    error_type: str | None = None
    error_message: str | None = None
