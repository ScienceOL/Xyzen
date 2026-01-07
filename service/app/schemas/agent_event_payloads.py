"""
Agent Event Data Types - Typed dictionaries for agent execution events.

This module defines the data structures for complex agent execution events,
providing flat context metadata for tracking nested agent execution.
"""

from __future__ import annotations

from typing import Any, TypedDict

from typing_extensions import NotRequired


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


# === Phase Events ===


class PhaseStartData(TypedDict):
    """Data for PHASE_START event."""

    phase_id: str
    phase_name: str
    description: NotRequired[str]
    expected_duration_ms: NotRequired[int]
    context: AgentExecutionContext


class PhaseEndData(TypedDict):
    """Data for PHASE_END event."""

    phase_id: str
    phase_name: str
    status: str  # "completed", "failed", "skipped"
    duration_ms: int
    output_summary: NotRequired[str]
    context: AgentExecutionContext


# === Node Events ===


class NodeStartData(TypedDict):
    """Data for NODE_START event."""

    node_id: str
    node_name: str
    node_type: str  # "llm", "tool", "router", etc.
    input_summary: NotRequired[str]
    context: AgentExecutionContext


class NodeEndData(TypedDict):
    """Data for NODE_END event."""

    node_id: str
    node_name: str
    node_type: str
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


# === Iteration Events ===


class IterationStartData(TypedDict):
    """Data for ITERATION_START event."""

    iteration_number: int  # 1-indexed
    max_iterations: int
    reason: NotRequired[str]  # Why iteration is needed
    context: AgentExecutionContext


class IterationEndData(TypedDict):
    """Data for ITERATION_END event."""

    iteration_number: int
    will_continue: bool  # Whether another iteration will follow
    reason: NotRequired[str]  # Why continuing or stopping
    context: AgentExecutionContext


# === State Events ===


class StateUpdateData(TypedDict):
    """
    Data for STATE_UPDATE event.

    Only includes non-sensitive state changes that are safe to display.
    """

    updated_keys: list[str]  # State keys that changed
    summary: dict[str, str]  # Key -> human-readable summary of new value
    context: AgentExecutionContext


# === Human-in-the-Loop Events ===


class HumanInputRequiredData(TypedDict):
    """Data for HUMAN_INPUT_REQUIRED event."""

    prompt: str  # Message to display to user
    input_type: str  # "text", "choice", "confirm", "form"
    choices: NotRequired[list[str]]  # For "choice" type
    form_schema: NotRequired[dict[str, Any]]  # JSON Schema for "form" type
    timeout_seconds: NotRequired[int]
    context: AgentExecutionContext


class HumanInputReceivedData(TypedDict):
    """Data for HUMAN_INPUT_RECEIVED event."""

    input_value: Any  # The user's input
    input_type: str
    context: AgentExecutionContext


# Export all types
__all__ = [
    "AgentExecutionContext",
    "AgentStartData",
    "AgentEndData",
    "AgentErrorData",
    "PhaseStartData",
    "PhaseEndData",
    "NodeStartData",
    "NodeEndData",
    "SubagentStartData",
    "SubagentEndData",
    "ProgressUpdateData",
    "IterationStartData",
    "IterationEndData",
    "StateUpdateData",
    "HumanInputRequiredData",
    "HumanInputReceivedData",
]
