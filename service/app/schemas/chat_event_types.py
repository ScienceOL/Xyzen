"""
Typed data structures for chat streaming events.

This module provides TypedDict classes that define the exact shape of data
payloads for each chat event type. Use these instead of dict[str, Any] for
better type safety and IDE autocompletion.

Example:
    from app.schemas.chat_event_types import StreamingChunkEvent, StreamingChunkData

    event: StreamingChunkEvent = {
        "type": ChatEventType.STREAMING_CHUNK,
        "data": {"id": "stream_123", "content": "Hello"}
    }
"""

from typing import Any, TypedDict
from typing_extensions import Literal, NotRequired

from app.schemas.chat_events import ChatEventType

# =============================================================================
# Data Payloads (the "data" field of each event)
# =============================================================================


class StreamingStartData(TypedDict):
    """Data payload for STREAMING_START event."""

    id: str


class StreamingChunkData(TypedDict):
    """Data payload for STREAMING_CHUNK event."""

    id: str
    content: str


class StreamingEndData(TypedDict):
    """Data payload for STREAMING_END event."""

    id: str
    created_at: float
    content: NotRequired[str]  # Optional content for final streaming result


class ProcessingData(TypedDict):
    """Data payload for PROCESSING event."""

    status: str


class LoadingData(TypedDict):
    """Data payload for LOADING event."""

    message: str


class ErrorData(TypedDict):
    """Data payload for ERROR event."""

    error: str


class ToolCallRequestData(TypedDict):
    """Data payload for TOOL_CALL_REQUEST event."""

    id: str
    name: str
    description: str
    arguments: dict[str, Any]
    status: str
    timestamp: float


class ToolCallResponseData(TypedDict):
    """Data payload for TOOL_CALL_RESPONSE event."""

    toolCallId: str
    status: str
    result: str
    error: NotRequired[str]


class TokenUsageData(TypedDict):
    """Data payload for TOKEN_USAGE event."""

    input_tokens: int
    output_tokens: int
    total_tokens: int


class CitationData(TypedDict):
    """Single citation entry within SearchCitationsData."""

    url: str
    title: str | None
    cited_text: str | None
    start_index: int | None
    end_index: int | None
    search_queries: NotRequired[list[str]]


class SearchCitationsData(TypedDict):
    """Data payload for SEARCH_CITATIONS event."""

    citations: list[CitationData]


class GeneratedFileInfo(TypedDict):
    """Single file entry within GeneratedFilesData."""

    id: str
    name: str
    type: str
    size: int
    category: str
    download_url: str


class GeneratedFilesData(TypedDict):
    """Data payload for GENERATED_FILES event."""

    files: list[GeneratedFileInfo]


class MessageSavedData(TypedDict):
    """Data payload for MESSAGE_SAVED event."""

    stream_id: str
    db_id: str
    created_at: str | None


class MessageData(TypedDict):
    """Data payload for MESSAGE event (non-streaming response)."""

    id: str
    content: str


class InsufficientBalanceData(TypedDict):
    """Data payload for insufficient_balance event."""

    error_code: str
    message: str
    message_cn: NotRequired[str]
    details: NotRequired[dict[str, Any]]
    action_required: str


class ThinkingStartData(TypedDict):
    """Data payload for THINKING_START event."""

    id: str


class ThinkingChunkData(TypedDict):
    """Data payload for THINKING_CHUNK event."""

    id: str
    content: str


class ThinkingEndData(TypedDict):
    """Data payload for THINKING_END event."""

    id: str


# =============================================================================
# Full Event Structures (type + data)
# =============================================================================


class StreamingStartEvent(TypedDict):
    """Full event structure for streaming start."""

    type: Literal[ChatEventType.STREAMING_START]
    data: StreamingStartData


class StreamingChunkEvent(TypedDict):
    """Full event structure for streaming chunk."""

    type: Literal[ChatEventType.STREAMING_CHUNK]
    data: StreamingChunkData


class StreamingEndEvent(TypedDict):
    """Full event structure for streaming end."""

    type: Literal[ChatEventType.STREAMING_END]
    data: StreamingEndData


class ProcessingEvent(TypedDict):
    """Full event structure for processing status."""

    type: Literal[ChatEventType.PROCESSING]
    data: ProcessingData


class LoadingEvent(TypedDict):
    """Full event structure for loading status."""

    type: Literal[ChatEventType.LOADING]
    data: LoadingData


class ErrorEvent(TypedDict):
    """Full event structure for errors."""

    type: Literal[ChatEventType.ERROR]
    data: ErrorData


class ToolCallRequestEvent(TypedDict):
    """Full event structure for tool call request."""

    type: Literal[ChatEventType.TOOL_CALL_REQUEST]
    data: ToolCallRequestData


class ToolCallResponseEvent(TypedDict):
    """Full event structure for tool call response."""

    type: Literal[ChatEventType.TOOL_CALL_RESPONSE]
    data: ToolCallResponseData


class TokenUsageEvent(TypedDict):
    """Full event structure for token usage."""

    type: Literal[ChatEventType.TOKEN_USAGE]
    data: TokenUsageData


class SearchCitationsEvent(TypedDict):
    """Full event structure for search citations."""

    type: Literal[ChatEventType.SEARCH_CITATIONS]
    data: SearchCitationsData


class GeneratedFilesEvent(TypedDict):
    """Full event structure for generated files."""

    type: Literal[ChatEventType.GENERATED_FILES]
    data: GeneratedFilesData


class MessageSavedEvent(TypedDict):
    """Full event structure for message saved confirmation."""

    type: Literal[ChatEventType.MESSAGE_SAVED]
    data: MessageSavedData


class MessageEvent(TypedDict):
    """Full event structure for non-streaming message."""

    type: Literal[ChatEventType.MESSAGE]
    data: MessageData


class InsufficientBalanceEvent(TypedDict):
    """Full event structure for insufficient balance error."""

    type: Literal[ChatEventType.INSUFFICIENT_BALANCE]
    data: InsufficientBalanceData


class ThinkingStartEvent(TypedDict):
    """Full event structure for thinking start."""

    type: Literal[ChatEventType.THINKING_START]
    data: ThinkingStartData


class ThinkingChunkEvent(TypedDict):
    """Full event structure for thinking chunk."""

    type: Literal[ChatEventType.THINKING_CHUNK]
    data: ThinkingChunkData


class ThinkingEndEvent(TypedDict):
    """Full event structure for thinking end."""

    type: Literal[ChatEventType.THINKING_END]
    data: ThinkingEndData


# =============================================================================
# Union type for generic event handling
# =============================================================================

# Type alias for any streaming event
StreamingEvent = (
    StreamingStartEvent
    | StreamingChunkEvent
    | StreamingEndEvent
    | ProcessingEvent
    | LoadingEvent
    | ErrorEvent
    | ToolCallRequestEvent
    | ToolCallResponseEvent
    | TokenUsageEvent
    | SearchCitationsEvent
    | GeneratedFilesEvent
    | MessageSavedEvent
    | MessageEvent
    | InsufficientBalanceEvent
    | ThinkingStartEvent
    | ThinkingChunkEvent
    | ThinkingEndEvent
)


__all__ = [
    # Data types
    "StreamingStartData",
    "StreamingChunkData",
    "StreamingEndData",
    "ProcessingData",
    "LoadingData",
    "ErrorData",
    "ToolCallRequestData",
    "ToolCallResponseData",
    "TokenUsageData",
    "CitationData",
    "SearchCitationsData",
    "GeneratedFileInfo",
    "GeneratedFilesData",
    "MessageSavedData",
    "MessageData",
    "InsufficientBalanceData",
    "ThinkingStartData",
    "ThinkingChunkData",
    "ThinkingEndData",
    # Event types
    "StreamingStartEvent",
    "StreamingChunkEvent",
    "StreamingEndEvent",
    "ProcessingEvent",
    "LoadingEvent",
    "ErrorEvent",
    "ToolCallRequestEvent",
    "ToolCallResponseEvent",
    "TokenUsageEvent",
    "SearchCitationsEvent",
    "GeneratedFilesEvent",
    "MessageSavedEvent",
    "MessageEvent",
    "InsufficientBalanceEvent",
    "ThinkingStartEvent",
    "ThinkingChunkEvent",
    "ThinkingEndEvent",
    # Union
    "StreamingEvent",
]
