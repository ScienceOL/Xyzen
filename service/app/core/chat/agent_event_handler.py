"""
Agent Event Handler - Utilities for emitting agent execution events.

This module provides a clean interface for emitting structured agent
execution events during graph-based agent execution.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.schemas.agent_event_payloads import (
    AgentEndData,
    AgentErrorData,
    AgentExecutionContext,
    AgentStartData,
    IterationEndData,
    IterationStartData,
    NodeEndData,
    NodeStartData,
    PhaseEndData,
    PhaseStartData,
    ProgressUpdateData,
    StateUpdateData,
    SubagentEndData,
    SubagentStartData,
)
from app.schemas.chat_event_payloads import (
    AgentEndEvent,
    AgentErrorEvent,
    AgentStartEvent,
    IterationEndEvent,
    IterationStartEvent,
    NodeEndEvent,
    NodeStartEvent,
    PhaseEndEvent,
    PhaseStartEvent,
    ProgressUpdateEvent,
    StateUpdateEvent,
    SubagentEndEvent,
    SubagentStartEvent,
)
from app.schemas.chat_event_types import ChatEventType


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
    execution_id: str = field(default_factory=lambda: f"exec_{uuid.uuid4().hex[:12]}")
    parent_execution_id: str | None = None
    depth: int = 0
    execution_path: list[str] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    current_node: str | None = None
    current_phase: str | None = None

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
            "execution_id": self.execution_id,
            "depth": self.depth,
            "execution_path": self.execution_path,
            "started_at": self.started_at,
            "elapsed_ms": int((time.time() - self.started_at) * 1000),
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
        )

    def set_current_node(self, node_id: str | None) -> None:
        """Update the current node being executed."""
        self.current_node = node_id

    def set_current_phase(self, phase: str | None) -> None:
        """Update the current phase."""
        self.current_phase = phase


class AgentEventHandler:
    """
    Static utility class for creating agent execution events.

    All methods return AgentEvent-typed envelopes that can be yielded
    from the agent execution stream.
    """

    # === Agent Lifecycle ===

    @staticmethod
    def emit_agent_start(
        ctx: AgentEventContext,
        total_nodes: int | None = None,
        estimated_duration_ms: int | None = None,
    ) -> AgentStartEvent:
        """Emit AGENT_START event."""
        data: AgentStartData = {"context": ctx.to_context_dict()}
        if total_nodes is not None:
            data["total_nodes"] = total_nodes
        if estimated_duration_ms is not None:
            data["estimated_duration_ms"] = estimated_duration_ms

        return {"type": ChatEventType.AGENT_START, "data": data}

    @staticmethod
    def emit_agent_end(
        ctx: AgentEventContext,
        status: str,
        output_summary: str | None = None,
    ) -> AgentEndEvent:
        """Emit AGENT_END event."""
        data: AgentEndData = {
            "context": ctx.to_context_dict(),
            "status": status,
            "duration_ms": int((time.time() - ctx.started_at) * 1000),
        }
        if output_summary:
            data["output_summary"] = output_summary

        return {"type": ChatEventType.AGENT_END, "data": data}

    @staticmethod
    def emit_agent_error(
        ctx: AgentEventContext,
        error: Exception,
        recoverable: bool = False,
        node_id: str | None = None,
    ) -> AgentErrorEvent:
        """Emit AGENT_ERROR event."""
        data: AgentErrorData = {
            "context": ctx.to_context_dict(),
            "error_type": type(error).__name__,
            "error_message": str(error),
            "recoverable": recoverable,
        }
        if node_id:
            data["node_id"] = node_id

        return {"type": ChatEventType.AGENT_ERROR, "data": data}

    # === Phase Events ===

    @staticmethod
    def emit_phase_start(
        ctx: AgentEventContext,
        phase_id: str,
        phase_name: str,
        description: str | None = None,
        expected_duration_ms: int | None = None,
    ) -> PhaseStartEvent:
        """Emit PHASE_START event."""
        ctx.set_current_phase(phase_id)

        data: PhaseStartData = {
            "phase_id": phase_id,
            "phase_name": phase_name,
            "context": ctx.to_context_dict(),
        }
        if description:
            data["description"] = description
        if expected_duration_ms is not None:
            data["expected_duration_ms"] = expected_duration_ms

        return {"type": ChatEventType.PHASE_START, "data": data}

    @staticmethod
    def emit_phase_end(
        ctx: AgentEventContext,
        phase_id: str,
        phase_name: str,
        status: str,
        start_time: float,
        output_summary: str | None = None,
    ) -> PhaseEndEvent:
        """Emit PHASE_END event."""
        data: PhaseEndData = {
            "phase_id": phase_id,
            "phase_name": phase_name,
            "status": status,
            "duration_ms": int((time.time() - start_time) * 1000),
            "context": ctx.to_context_dict(),
        }
        if output_summary:
            data["output_summary"] = output_summary

        return {"type": ChatEventType.PHASE_END, "data": data}

    # === Node Events ===

    @staticmethod
    def emit_node_start(
        ctx: AgentEventContext,
        node_id: str,
        node_name: str,
        node_type: str,
        input_summary: str | None = None,
    ) -> NodeStartEvent:
        """Emit NODE_START event."""
        ctx.set_current_node(node_id)

        data: NodeStartData = {
            "node_id": node_id,
            "node_name": node_name,
            "node_type": node_type,
            "context": ctx.to_context_dict(),
        }
        if input_summary:
            data["input_summary"] = input_summary

        return {"type": ChatEventType.NODE_START, "data": data}

    @staticmethod
    def emit_node_end(
        ctx: AgentEventContext,
        node_id: str,
        node_name: str,
        node_type: str,
        status: str,
        start_time: float,
        output_summary: str | None = None,
    ) -> NodeEndEvent:
        """Emit NODE_END event."""
        data: NodeEndData = {
            "node_id": node_id,
            "node_name": node_name,
            "node_type": node_type,
            "status": status,
            "duration_ms": int((time.time() - start_time) * 1000),
            "context": ctx.to_context_dict(),
        }
        if output_summary:
            data["output_summary"] = output_summary

        return {"type": ChatEventType.NODE_END, "data": data}

    # === Subagent Events ===

    @staticmethod
    def emit_subagent_start(
        ctx: AgentEventContext,
        subagent_id: str,
        subagent_name: str,
        subagent_type: str = "graph",
        input_summary: str | None = None,
    ) -> SubagentStartEvent:
        """Emit SUBAGENT_START event."""
        data: SubagentStartData = {
            "subagent_id": subagent_id,
            "subagent_name": subagent_name,
            "subagent_type": subagent_type,
            "context": ctx.to_context_dict(),
        }
        if input_summary:
            data["input_summary"] = input_summary

        return {"type": ChatEventType.SUBAGENT_START, "data": data}

    @staticmethod
    def emit_subagent_end(
        ctx: AgentEventContext,
        subagent_id: str,
        subagent_name: str,
        status: str,
        start_time: float,
        output_summary: str | None = None,
    ) -> SubagentEndEvent:
        """Emit SUBAGENT_END event."""
        data: SubagentEndData = {
            "subagent_id": subagent_id,
            "subagent_name": subagent_name,
            "status": status,
            "duration_ms": int((time.time() - start_time) * 1000),
            "context": ctx.to_context_dict(),
        }
        if output_summary:
            data["output_summary"] = output_summary

        return {"type": ChatEventType.SUBAGENT_END, "data": data}

    # === Progress Events ===

    @staticmethod
    def emit_progress(
        ctx: AgentEventContext,
        percent: int,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> ProgressUpdateEvent:
        """Emit PROGRESS_UPDATE event."""
        data: ProgressUpdateData = {
            "progress_percent": max(0, min(100, percent)),
            "message": message,
            "context": ctx.to_context_dict(),
        }
        if details:
            data["details"] = details

        return {"type": ChatEventType.PROGRESS_UPDATE, "data": data}

    # === Iteration Events ===

    @staticmethod
    def emit_iteration_start(
        ctx: AgentEventContext,
        iteration_number: int,
        max_iterations: int,
        reason: str | None = None,
    ) -> IterationStartEvent:
        """Emit ITERATION_START event."""
        data: IterationStartData = {
            "iteration_number": iteration_number,
            "max_iterations": max_iterations,
            "context": ctx.to_context_dict(),
        }
        if reason:
            data["reason"] = reason

        return {"type": ChatEventType.ITERATION_START, "data": data}

    @staticmethod
    def emit_iteration_end(
        ctx: AgentEventContext,
        iteration_number: int,
        will_continue: bool,
        reason: str | None = None,
    ) -> IterationEndEvent:
        """Emit ITERATION_END event."""
        data: IterationEndData = {
            "iteration_number": iteration_number,
            "will_continue": will_continue,
            "context": ctx.to_context_dict(),
        }
        if reason:
            data["reason"] = reason

        return {"type": ChatEventType.ITERATION_END, "data": data}

    # === State Events ===

    @staticmethod
    def emit_state_update(
        ctx: AgentEventContext,
        updated_keys: list[str],
        summary: dict[str, str],
    ) -> StateUpdateEvent:
        """
        Emit STATE_UPDATE event.

        Only include non-sensitive, summarized state information.
        """
        data: StateUpdateData = {
            "updated_keys": updated_keys,
            "summary": summary,
            "context": ctx.to_context_dict(),
        }

        return {"type": ChatEventType.STATE_UPDATE, "data": data}


# Export
__all__ = [
    "AgentEventContext",
    "AgentEventHandler",
]
