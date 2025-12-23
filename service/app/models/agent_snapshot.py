from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP, Column
from sqlmodel import JSON, Field, SQLModel


class AgentSnapshot(SQLModel, table=True):
    """Immutable version history of agent configurations"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    agent_id: UUID = Field(index=True, description="Original agent this snapshot belongs to")
    version: int = Field(description="Monotonic version number (1, 2, 3...)")

    # Full configuration dump
    configuration: dict[str, Any] = Field(
        sa_column=Column(JSON),
        description="Complete agent config: {prompt, model, temperature, provider_id, tags, etc.}",
    )

    # Linked resources (serialized for immutability)
    mcp_server_configs: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Snapshot of linked MCP servers: [{id, name, description}, ...]",
    )
    knowledge_set_config: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSON),
        description="Snapshot of knowledge set: {id, name, file_ids: [...]}",
    )

    commit_message: str = Field(description="Change description from publisher")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class AgentSnapshotCreate(SQLModel):
    """Model for creating a new agent snapshot"""

    agent_id: UUID
    configuration: dict[str, Any]
    mcp_server_configs: list[dict[str, Any]] = []
    knowledge_set_config: dict[str, Any] | None = None
    commit_message: str


class AgentSnapshotRead(SQLModel):
    """Model for reading agent snapshot information"""

    id: UUID
    agent_id: UUID
    version: int
    configuration: dict[str, Any]
    mcp_server_configs: list[dict[str, Any]]
    knowledge_set_config: dict[str, Any] | None
    commit_message: str
    created_at: datetime
