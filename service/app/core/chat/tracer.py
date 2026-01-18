"""
LangGraph Tracer - Central event translator for LangGraph execution.

This module provides a centralized tracer that:
1. Converts raw LangGraph events to standard business events
2. Tracks execution state (current node, timeline)
3. Handles double-write (WebSocket + DB persistence)

The tracer is the single source of truth for event emission, ensuring:
- Consistent event formatting
- Accurate timing and duration tracking
- Proper timeline accumulation for AgentRun persistence
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from app.schemas.chat_event_payloads import StreamingEvent
from app.schemas.chat_event_types import ChatEventType

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.chat.agent_event_handler import AgentEventContext

logger = logging.getLogger(__name__)


@dataclass
class TimelineEntry:
    """
    Single entry in the execution timeline.

    Represents an event that occurred during agent execution,
    stored in AgentRun.node_data["timeline"].
    """

    event_type: str
    timestamp: float
    node_id: str | None = None
    node_name: str | None = None
    node_type: str | None = None
    status: str | None = None
    duration_ms: int | None = None
    output: Any = None  # Full node output for timeline display
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result: dict[str, Any] = {
            "event_type": self.event_type,
            "timestamp": self.timestamp,
        }
        if self.node_id is not None:
            result["node_id"] = self.node_id
        if self.node_name is not None:
            result["node_name"] = self.node_name
        if self.node_type is not None:
            result["node_type"] = self.node_type
        if self.status is not None:
            result["status"] = self.status
        if self.duration_ms is not None:
            result["duration_ms"] = self.duration_ms
        if self.output is not None:
            result["output"] = self.output
        if self.metadata:
            result["metadata"] = self.metadata
        return result


@dataclass
class NodeState:
    """Tracks state of a single node execution."""

    node_id: str
    node_name: str
    node_type: str
    start_time: float
    component_key: str | None = None
    content_buffer: list[str] = field(default_factory=list)


@dataclass
class LangGraphTracer:
    """
    Central event translator for LangGraph execution.

    Single source of truth for:
    1. Converting raw LangGraph events to business events
    2. Tracking execution state (current node, timeline)
    3. Accumulating timeline data for DB persistence

    Usage:
        tracer = LangGraphTracer(
            stream_id="stream_123",
            event_ctx=agent_event_ctx,
            db=db_session,
            message_id=message_uuid,
        )

        # At agent start
        event = tracer.on_agent_start()

        # During streaming
        event = tracer.on_node_start("research", "Research", "llm")
        event = tracer.on_streaming_chunk("Hello")
        event = tracer.on_node_end("research", "completed", {"result": "..."})

        # At end
        event = tracer.on_agent_end("completed")

        # Get accumulated timeline for persistence
        timeline_data = tracer.get_node_data()
    """

    stream_id: str
    event_ctx: "AgentEventContext | None"
    db: "AsyncSession"
    message_id: UUID | None = None

    # State tracking
    timeline: list[TimelineEntry] = field(default_factory=list)
    agent_run_id: UUID | None = None
    current_node: NodeState | None = None
    node_outputs: dict[str, Any] = field(default_factory=dict)
    node_order: list[str] = field(default_factory=list)
    node_names: dict[str, str] = field(default_factory=dict)

    # Agent lifecycle
    agent_started: bool = False
    agent_start_time: float = 0.0

    # Streaming state
    is_streaming: bool = False
    streaming_buffer: list[str] = field(default_factory=list)

    # Thinking state
    is_thinking: bool = False
    thinking_buffer: list[str] = field(default_factory=list)

    # Tool call tracking (node_id -> list of tool calls)
    tool_calls: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def on_agent_start(self) -> StreamingEvent | None:
        """
        Handle agent start event.

        Creates a timeline entry and returns the AGENT_START event.
        """
        if not self.event_ctx:
            return None

        self.agent_started = True
        self.agent_start_time = time.time()

        # Add to timeline
        entry = TimelineEntry(
            event_type="agent_start",
            timestamp=self.agent_start_time,
            metadata={
                "agent_id": self.event_ctx.agent_id,
                "agent_name": self.event_ctx.agent_name,
                "agent_type": self.event_ctx.agent_type,
            },
        )
        self.timeline.append(entry)

        logger.info(f"[Tracer] Agent started: {self.event_ctx.agent_name}")

        return {
            "type": ChatEventType.AGENT_START,
            "data": {
                "context": {
                    "agent_id": self.event_ctx.agent_id,
                    "agent_name": self.event_ctx.agent_name,
                    "agent_type": self.event_ctx.agent_type,
                    "execution_id": self.event_ctx.execution_id,
                    "depth": 0,
                    "execution_path": [self.event_ctx.agent_name],
                    "started_at": int(self.agent_start_time * 1000),
                },
            },
        }

    def on_node_start(
        self,
        node_id: str,
        node_name: str | None = None,
        node_type: str = "llm",
        component_key: str | None = None,
    ) -> StreamingEvent | None:
        """
        Handle node start event.

        Args:
            node_id: Unique identifier for the node
            node_name: Display name (defaults to node_id)
            node_type: Type of node ("llm", "tool", "router")
            component_key: Optional component key (e.g., "system:deep_research:clarify").
                           If not provided, looks up from event_ctx.node_component_keys.

        Returns:
            NODE_START event
        """
        if not self.event_ctx:
            return None

        # Use node_id as name if not provided
        display_name = node_name or node_id

        # Look up component_key from event_ctx if not provided
        resolved_component_key = component_key
        if resolved_component_key is None and self.event_ctx.node_component_keys:
            resolved_component_key = self.event_ctx.node_component_keys.get(node_id)

        # Track node state
        self.current_node = NodeState(
            node_id=node_id,
            node_name=display_name,
            node_type=node_type,
            start_time=time.time(),
            component_key=resolved_component_key,
        )

        # Track node name mapping
        self.node_names[node_id] = display_name

        # Add to timeline
        entry = TimelineEntry(
            event_type="node_start",
            timestamp=self.current_node.start_time,
            node_id=node_id,
            node_name=display_name,
            node_type=node_type,
            metadata={"component_key": resolved_component_key} if resolved_component_key else {},
        )
        self.timeline.append(entry)

        logger.info(
            f"[Tracer] Node started: {node_id}"
            + (f" (component: {resolved_component_key})" if resolved_component_key else "")
        )

        event_data: dict[str, Any] = {
            "node_id": node_id,
            "node_name": display_name,
            "node_type": node_type,
            "context": {
                "agent_id": self.event_ctx.agent_id,
                "agent_name": self.event_ctx.agent_name,
                "agent_type": self.event_ctx.agent_type,
                "execution_id": self.event_ctx.execution_id,
                "depth": 0,
                "execution_path": [self.event_ctx.agent_name],
                "current_node": node_id,
                "started_at": int(self.agent_start_time * 1000),
            },
        }

        if resolved_component_key:
            event_data["component_key"] = resolved_component_key

        return cast(
            StreamingEvent,
            {
                "type": ChatEventType.NODE_START,
                "data": event_data,
            },
        )

    def on_node_end(
        self,
        node_id: str,
        status: str = "completed",
        output: Any = None,
        node_name: str | None = None,
        node_type: str | None = None,
        component_key: str | None = None,
    ) -> StreamingEvent | None:
        """
        Handle node end event.

        Args:
            node_id: Node identifier
            status: Completion status ("completed", "failed", "skipped")
            output: Full node output (stored in timeline for replay)
            node_name: Display name (uses tracked name if not provided)
            node_type: Node type (uses tracked type if not provided)
            component_key: Optional component key (uses tracked key or looks up from event_ctx)

        Returns:
            NODE_END event
        """
        if not self.event_ctx:
            return None

        # Calculate duration
        end_time = time.time()
        start_time = self.current_node.start_time if self.current_node else self.agent_start_time
        duration_ms = int((end_time - start_time) * 1000)

        # Resolve names from tracking or parameters
        display_name = node_name or self.node_names.get(node_id) or node_id
        resolved_node_type = node_type or (self.current_node.node_type if self.current_node else "llm")

        # Resolve component_key: explicit > tracked > event_ctx lookup
        resolved_component_key = component_key
        if resolved_component_key is None and self.current_node:
            resolved_component_key = self.current_node.component_key
        if resolved_component_key is None and self.event_ctx.node_component_keys:
            resolved_component_key = self.event_ctx.node_component_keys.get(node_id)

        # Store node output
        if output is not None:
            self.node_outputs[node_id] = output

        # Track execution order
        if node_id not in self.node_order:
            self.node_order.append(node_id)

        # Add to timeline
        entry = TimelineEntry(
            event_type="node_end",
            timestamp=end_time,
            node_id=node_id,
            node_name=display_name,
            node_type=resolved_node_type,
            status=status,
            duration_ms=duration_ms,
            output=output,
            metadata={"component_key": resolved_component_key} if resolved_component_key else {},
        )
        self.timeline.append(entry)

        logger.info(f"[Tracer] Node ended: {node_id} (status={status}, duration={duration_ms}ms)")

        # Clear current node
        if self.current_node and self.current_node.node_id == node_id:
            self.current_node = None

        event_data: dict[str, Any] = {
            "node_id": node_id,
            "node_name": display_name,
            "node_type": resolved_node_type,
            "status": status,
            "duration_ms": duration_ms,
            "context": {
                "agent_id": self.event_ctx.agent_id,
                "agent_name": self.event_ctx.agent_name,
                "agent_type": self.event_ctx.agent_type,
                "execution_id": self.event_ctx.execution_id,
                "depth": 0,
                "execution_path": [self.event_ctx.agent_name],
                "current_node": node_id,
                "started_at": int(self.agent_start_time * 1000),
            },
        }

        if resolved_component_key:
            event_data["component_key"] = resolved_component_key

        return cast(
            StreamingEvent,
            {
                "type": ChatEventType.NODE_END,
                "data": event_data,
            },
        )

    def on_agent_end(self, status: str = "completed") -> StreamingEvent | None:
        """
        Handle agent end event.

        Args:
            status: Final status ("completed", "failed", "cancelled")

        Returns:
            AGENT_END event
        """
        if not self.event_ctx or not self.agent_started:
            return None

        end_time = time.time()
        duration_ms = int((end_time - self.agent_start_time) * 1000)

        # Add to timeline
        entry = TimelineEntry(
            event_type="agent_end",
            timestamp=end_time,
            status=status,
            duration_ms=duration_ms,
        )
        self.timeline.append(entry)

        logger.info(f"[Tracer] Agent ended: {self.event_ctx.agent_name} (status={status}, duration={duration_ms}ms)")

        return {
            "type": ChatEventType.AGENT_END,
            "data": {
                "context": {
                    "agent_id": self.event_ctx.agent_id,
                    "agent_name": self.event_ctx.agent_name,
                    "agent_type": self.event_ctx.agent_type,
                    "execution_id": self.event_ctx.execution_id,
                    "depth": 0,
                    "execution_path": [self.event_ctx.agent_name],
                    "started_at": int(self.agent_start_time * 1000),
                },
                "status": status,
                "duration_ms": duration_ms,
            },
        }

    def get_node_data(self) -> dict[str, Any]:
        """
        Get accumulated node data for AgentRun persistence.

        Returns:
            Dictionary containing timeline, node_outputs, node_order, and node_names
        """
        return {
            "timeline": [entry.to_dict() for entry in self.timeline],
            "node_outputs": self.node_outputs,
            "node_order": self.node_order,
            "node_names": self.node_names,
        }

    def get_agent_state(self) -> dict[str, Any]:
        """
        Get agent state for compatibility with existing streaming_end event.

        This provides backward compatibility with the current tasks/chat.py
        which expects agent_state in streaming_end event.

        Now includes timeline data for componentKey persistence.
        """
        logger.info(f"[Tracer] get_agent_state called, timeline has {len(self.timeline)} entries")
        for entry in self.timeline:
            logger.info(f"[Tracer] Timeline entry: {entry.event_type} node={entry.node_id}")

        state: dict[str, Any] = {
            "timeline": [entry.to_dict() for entry in self.timeline],
            "node_outputs": self.node_outputs,
            "node_order": self.node_order,
            "node_names": self.node_names,
        }

        if self.event_ctx:
            state["agent_id"] = self.event_ctx.agent_id
            state["agent_name"] = self.event_ctx.agent_name
            state["agent_type"] = self.event_ctx.agent_type
            state["execution_id"] = self.event_ctx.execution_id

        return state

    def record_node_output(self, node_id: str, output: Any, node_name: str | None = None) -> None:
        """
        Record a node's output without emitting an event.

        Useful for recording outputs from nodes processed in updates mode
        where events are not emitted directly.

        Args:
            node_id: Node identifier
            output: Node output data
            node_name: Optional display name
        """
        self.node_outputs[node_id] = output
        if node_id not in self.node_order:
            self.node_order.append(node_id)
        if node_name:
            self.node_names[node_id] = node_name

    def get_current_node_id(self) -> str | None:
        """Get the ID of the currently executing node."""
        return self.current_node.node_id if self.current_node else None

    def detect_node_transition(self, metadata: dict[str, Any]) -> str | None:
        """
        Detect node transitions from LangGraph messages mode metadata.

        Args:
            metadata: Metadata dict from messages mode chunk

        Returns:
            New node_id if transition detected, None otherwise
        """
        new_node = metadata.get("langgraph_node") or metadata.get("node")
        current = self.get_current_node_id()
        if new_node and new_node != current:
            return new_node
        return None


__all__ = [
    "LangGraphTracer",
    "TimelineEntry",
    "NodeState",
]
