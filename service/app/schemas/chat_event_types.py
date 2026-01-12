"""
Centralized chat event constants.

Use StrEnum so enum values behave like strings in JSON payloads while
providing type safety and autocompletion across the codebase.

Example:
    from app.schemas.chat_event_types import ChatEventType
    if event_type == ChatEventType.STREAMING_START:
        ...
"""

from enum import StrEnum
from typing import FrozenSet


class ChatEventType(StrEnum):
    """Server -> Client event types used across chat flows."""

    # Generic
    MESSAGE = "message"
    LOADING = "loading"
    ERROR = "error"
    PROCESSING = "processing"

    # Streaming lifecycle
    STREAMING_START = "streaming_start"
    STREAMING_CHUNK = "streaming_chunk"
    STREAMING_END = "streaming_end"

    # Tool invocation
    TOOL_CALL_REQUEST = "tool_call_request"
    TOOL_CALL_RESPONSE = "tool_call_response"

    # Post-processing/ack
    MESSAGE_SAVED = "message_saved"

    # Token usage tracking
    TOKEN_USAGE = "token_usage"

    # Built-in search citations
    SEARCH_CITATIONS = "search_citations"

    # Generated content
    GENERATED_FILES = "generated_files"

    # Balance/billing events
    INSUFFICIENT_BALANCE = "insufficient_balance"

    # Thinking/reasoning content (for models like Claude, DeepSeek R1, OpenAI o1)
    THINKING_START = "thinking_start"
    THINKING_CHUNK = "thinking_chunk"
    THINKING_END = "thinking_end"

    # === Agent Execution Events (for complex graph-based agents) ===

    # Agent lifecycle
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    AGENT_ERROR = "agent_error"

    # Phase/workflow stage execution
    PHASE_START = "phase_start"
    PHASE_END = "phase_end"

    # Individual node execution
    NODE_START = "node_start"
    NODE_END = "node_end"

    # Subagent execution (nested agents)
    SUBAGENT_START = "subagent_start"
    SUBAGENT_END = "subagent_end"

    # Progress updates
    PROGRESS_UPDATE = "progress_update"

    # State changes (non-sensitive updates)
    STATE_UPDATE = "state_update"

    # Iteration events (for loops in graph execution)
    ITERATION_START = "iteration_start"
    ITERATION_END = "iteration_end"

    # Human-in-the-loop events
    HUMAN_INPUT_REQUIRED = "human_input_required"
    HUMAN_INPUT_RECEIVED = "human_input_received"


class ChatClientEventType(StrEnum):
    """Client -> Server event types (messages coming from the frontend)."""

    # Regular chat message (default when no explicit type provided)
    MESSAGE = "message"

    # Tool confirmation workflow
    TOOL_CALL_CONFIRM = "tool_call_confirm"
    TOOL_CALL_CANCEL = "tool_call_cancel"


class ToolCallStatus(StrEnum):
    """Status values for tool call lifecycle."""

    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingStatus(StrEnum):
    """Status values used with the PROCESSING event."""

    PREPARING_REQUEST = "preparing_request"
    PREPARING_GRAPH_EXECUTION = "preparing_graph_execution"
    EXECUTING_GRAPH = "executing_graph"
    PROCESSING_GRAPH_RESULT = "processing_graph_result"


# Helpful groupings for conditional logic
SERVER_STREAMING_EVENTS: FrozenSet[ChatEventType] = frozenset(
    {
        ChatEventType.STREAMING_START,
        ChatEventType.STREAMING_CHUNK,
        ChatEventType.STREAMING_END,
    }
)

SERVER_TOOL_EVENTS: FrozenSet[ChatEventType] = frozenset(
    {ChatEventType.TOOL_CALL_REQUEST, ChatEventType.TOOL_CALL_RESPONSE}
)

SERVER_AGENT_EVENTS: FrozenSet[ChatEventType] = frozenset(
    {
        ChatEventType.AGENT_START,
        ChatEventType.AGENT_END,
        ChatEventType.AGENT_ERROR,
        ChatEventType.PHASE_START,
        ChatEventType.PHASE_END,
        ChatEventType.NODE_START,
        ChatEventType.NODE_END,
        ChatEventType.SUBAGENT_START,
        ChatEventType.SUBAGENT_END,
        ChatEventType.PROGRESS_UPDATE,
        ChatEventType.STATE_UPDATE,
        ChatEventType.ITERATION_START,
        ChatEventType.ITERATION_END,
    }
)

__all__ = [
    "ChatEventType",
    "ChatClientEventType",
    "ToolCallStatus",
    "ProcessingStatus",
    "SERVER_STREAMING_EVENTS",
    "SERVER_TOOL_EVENTS",
    "SERVER_AGENT_EVENTS",
]
