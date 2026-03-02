"""
Agent Event Context - Execution context for agent event emission.

This module provides the ``AgentEventContext`` dataclass that tracks
agent execution state and produces context dictionaries consumed by
the ``LangGraphTracer``.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from app.schemas.agent_event_payloads import AgentExecutionContext


@dataclass
class AgentEventContext:
    """
    Maintains execution context for event emission.

    This class tracks the current execution state and provides methods
    for creating child contexts for subagent execution.
    """

    agent_id: str
    agent_name: str
    agent_type: str  # actual system key (e.g., "react", "deep_research") or "graph"
    agent_avatar: str = ""
    execution_id: str = field(default_factory=lambda: f"exec_{uuid.uuid4().hex[:12]}")
    parent_execution_id: str | None = None
    depth: int = 0
    execution_path: list[str] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    current_node: str | None = None
    current_phase: str | None = None
    # Mapping of node_id -> component_key for v2 COMPONENT nodes
    node_component_keys: dict[str, str] = field(default_factory=dict)
    # External stream_id propagated from WebSocket handler for unified event routing
    stream_id: str = ""

    def __post_init__(self) -> None:
        """Initialize execution path if empty."""
        if not self.execution_path:
            self.execution_path = [self.agent_name]

    def to_context_dict(self) -> AgentExecutionContext:
        """Convert to AgentExecutionContext dictionary for events."""
        ctx: AgentExecutionContext = {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "agent_type": self.agent_type,
            "agent_avatar": self.agent_avatar,
            "execution_id": self.execution_id,
            "depth": self.depth,
            "execution_path": self.execution_path,
            "started_at": self.started_at,
            "elapsed_ms": int((time.time() - self.started_at) * 1000),
            "stream_id": self.stream_id,
        }

        if self.parent_execution_id:
            ctx["parent_execution_id"] = self.parent_execution_id
        if self.current_node:
            ctx["current_node"] = self.current_node
        if self.current_phase:
            ctx["current_phase"] = self.current_phase

        return ctx

    def child_context(
        self,
        subagent_id: str,
        subagent_name: str,
        subagent_type: str = "subagent",
    ) -> "AgentEventContext":
        """
        Create a child context for subagent execution.

        Args:
            subagent_id: UUID of the subagent
            subagent_name: Name of the subagent
            subagent_type: Type of the subagent

        Returns:
            New AgentEventContext for the subagent
        """
        return AgentEventContext(
            agent_id=subagent_id,
            agent_name=subagent_name,
            agent_type=subagent_type,
            execution_id=f"{self.execution_id}:{subagent_id[:8]}",
            parent_execution_id=self.execution_id,
            depth=self.depth + 1,
            execution_path=self.execution_path + [subagent_name],
            started_at=time.time(),
            stream_id=self.stream_id,
        )

    def set_current_node(self, node_id: str | None) -> None:
        """Update the current node being executed."""
        self.current_node = node_id

    def set_current_phase(self, phase: str | None) -> None:
        """Update the current phase."""
        self.current_phase = phase


__all__ = [
    "AgentEventContext",
]
