"""
Centralized chat event constants.

Use StrEnum so enum values behave like strings in JSON payloads while
providing type safety and autocompletion across the codebase.

Example:
    from schemas.chat_events import ChatEventType
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

__all__ = [
    "ChatEventType",
    "ChatClientEventType",
    "ToolCallStatus",
    "ProcessingStatus",
    "SERVER_STREAMING_EVENTS",
    "SERVER_TOOL_EVENTS",
]
