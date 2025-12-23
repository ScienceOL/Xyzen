from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import TIMESTAMP
from sqlmodel import JSON, Column, Field, SQLModel


class GraphAgentBase(SQLModel):
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    state_schema: dict[str, Any] = Field(sa_column=Column(JSON))
    is_active: bool = Field(default=True)
    parent_agent_id: UUID | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    is_published: bool = Field(default=False, index=True)
    is_official: bool = Field(default=False, index=True)


class GraphAgent(GraphAgentBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class GraphAgentCreate(SQLModel):
    name: str
    description: str | None = None
    state_schema: dict[str, Any]
    parent_agent_id: UUID | None = None
    is_published: bool = False
    is_official: bool = False


class GraphAgentRead(GraphAgentBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class GraphAgentUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    state_schema: dict[str, Any] | None = None
    is_active: bool | None = None
    is_published: bool | None = None
    is_official: bool | None = None


class GraphNodeBase(SQLModel):
    name: str = Field(max_length=100)
    node_type: str = Field(max_length=50)  # 'llm', 'tool', 'router', 'subagent'
    config: dict[str, Any] = Field(sa_column=Column(JSON))
    graph_agent_id: UUID = Field(index=True)
    position_x: float | None = None
    position_y: float | None = None


class GraphNode(GraphNodeBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class GraphNodeCreate(SQLModel):
    name: str
    node_type: str
    config: dict[str, Any]
    graph_agent_id: UUID
    position_x: float | None = None
    position_y: float | None = None


class GraphNodeRead(GraphNodeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class GraphNodeUpdate(SQLModel):
    name: str | None = None
    node_type: str | None = None
    config: dict[str, Any] | None = None
    position_x: float | None = None
    position_y: float | None = None


class GraphEdgeBase(SQLModel):
    from_node_id: UUID = Field(index=True)
    to_node_id: UUID = Field(index=True)
    condition: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))  # Conditional routing logic
    graph_agent_id: UUID = Field(index=True)
    label: str | None = Field(default=None, max_length=100)  # For UI display


class GraphEdge(GraphEdgeBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
    )


class GraphEdgeCreate(SQLModel):
    from_node_id: UUID
    to_node_id: UUID
    condition: dict[str, Any] | None = None
    graph_agent_id: UUID
    label: str | None = None


class GraphEdgeRead(GraphEdgeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class GraphEdgeUpdate(SQLModel):
    condition: dict[str, Any] | None = None
    label: str | None = None


# Composite models for complex operations
class GraphAgentWithGraph(GraphAgentRead):
    nodes: list[GraphNodeRead] = []
    edges: list[GraphEdgeRead] = []


class GraphAgentCreateWithGraph(SQLModel):
    agent: GraphAgentCreate
    nodes: list[GraphNodeCreate] = []
    edges: list[GraphEdgeCreate] = []


class GraphExecutionResult(SQLModel):
    """Result from executing a graph agent"""

    agent_id: UUID
    final_state: dict[str, Any]
    execution_steps: list[dict[str, Any]]  # Step-by-step execution log
    success: bool
    error_message: str | None = None
    execution_time_ms: int
