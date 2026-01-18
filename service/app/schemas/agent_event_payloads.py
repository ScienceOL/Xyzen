"""
Agent Event Data Types - Typed dictionaries for agent execution events.

This module defines the data structures for complex agent execution events,
providing flat context metadata for tracking nested agent execution.

Also includes timeline data structures for AgentRun persistence.
"""

from __future__ import annotations

from typing import Any, TypedDict

from typing_extensions import NotRequired


# === Timeline Data Structures ===


class TimelineEntryDict(TypedDict, total=False):
    """
    Single entry in the AgentRun execution timeline.

    Stored in AgentRun.node_data["timeline"] for execution replay.
    """

    event_type: str  # "agent_start", "node_start", "node_end", "agent_end"
    timestamp: float  # Unix timestamp

    # Node information (for node_start/node_end events)
    node_id: str
    node_name: str
    node_type: str  # "llm", "tool", "router"

    # Completion information (for node_end/agent_end events)
    status: str  # "completed", "failed", "skipped"
    duration_ms: int

    # Node output (for node_end events)
    output: Any  # Full structured output for timeline display

    # Additional metadata
    metadata: dict[str, Any]


class NodeDataDict(TypedDict, total=False):
    """
    Complete node execution data stored in AgentRun.node_data.

    Contains both timeline (for replay) and convenience maps (for quick access).
    """

    # Full execution timeline
    timeline: list[TimelineEntryDict]

    # Convenience maps for quick access
    node_outputs: dict[str, Any]  # node_id -> output
    node_order: list[str]  # Execution order of nodes
    node_names: dict[str, str]  # node_id -> display name


class AgentExecutionContext(TypedDict):
    """
    Flat context metadata included with all agent events.

    This context allows the frontend to:
    - Track which agent is executing
    - Understand execution depth for nested agents
    - Visualize the execution path
    - Measure timing
    """

    # Agent identification
    agent_id: str  # UUID of the executing agent
    agent_name: str  # Human-readable name
    agent_type: str  # "react", "graph", "system"

    # Execution tracking (flat, not hierarchical)
    execution_id: str  # Unique ID for this execution run
    parent_execution_id: NotRequired[str]  # Present if this is a subagent
    depth: int  # 0 for root agent, 1 for first subagent, etc.
    execution_path: list[str]  # Path of agent names: ["root", "deep_research", "web_search"]

    # Current position in graph
    current_node: NotRequired[str]  # Current node ID
    current_phase: NotRequired[str]  # Current phase name (if applicable)

    # Timing
    started_at: float  # Unix timestamp when execution started
    elapsed_ms: NotRequired[int]  # Milliseconds since started_at


# === Agent Lifecycle Events ===


class AgentStartData(TypedDict):
    """Data for AGENT_START event."""

    context: AgentExecutionContext
    total_nodes: NotRequired[int]  # Total nodes in graph
    estimated_duration_ms: NotRequired[int]


class AgentEndData(TypedDict):
    """Data for AGENT_END event."""

    context: AgentExecutionContext
    status: str  # "completed", "failed", "cancelled"
    duration_ms: int
    output_summary: NotRequired[str]


class AgentErrorData(TypedDict):
    """Data for AGENT_ERROR event."""

    context: AgentExecutionContext
    error_type: str  # Error class name
    error_message: str
    recoverable: bool
    node_id: NotRequired[str]  # Node where error occurred


# === Node Events ===


class NodeStartData(TypedDict):
    """Data for NODE_START event."""

    node_id: str
    node_name: str
    node_type: str  # "llm", "tool", "router", etc.
    component_key: NotRequired[str]  # e.g., "system:deep_research:clarify"
    input_summary: NotRequired[str]
    context: AgentExecutionContext


class NodeEndData(TypedDict):
    """Data for NODE_END event."""

    node_id: str
    node_name: str
    node_type: str
    component_key: NotRequired[str]  # e.g., "system:deep_research:clarify"
    status: str  # "completed", "failed", "skipped"
    duration_ms: int
    output_summary: NotRequired[str]
    context: AgentExecutionContext


# === Subagent Events ===


class SubagentStartData(TypedDict):
    """Data for SUBAGENT_START event."""

    subagent_id: str
    subagent_name: str
    subagent_type: str  # Agent type of the subagent
    input_summary: NotRequired[str]
    context: AgentExecutionContext


class SubagentEndData(TypedDict):
    """Data for SUBAGENT_END event."""

    subagent_id: str
    subagent_name: str
    status: str
    duration_ms: int
    output_summary: NotRequired[str]
    context: AgentExecutionContext


# === Progress Events ===


class ProgressUpdateData(TypedDict):
    """Data for PROGRESS_UPDATE event."""

    progress_percent: int  # 0-100
    message: str  # Human-readable progress message
    details: NotRequired[dict[str, Any]]  # Additional structured data
    context: AgentExecutionContext


# Export all types
__all__ = [
    # Timeline types
    "TimelineEntryDict",
    "NodeDataDict",
    # Context types
    "AgentExecutionContext",
    "AgentStartData",
    "AgentEndData",
    "AgentErrorData",
    "NodeStartData",
    "NodeEndData",
    "SubagentStartData",
    "SubagentEndData",
    "ProgressUpdateData",
]
