"""
Unit tests for thinking event handling.

Tests the ThinkingEventHandler class and thinking content extraction
from various provider formats (Anthropic, DeepSeek, etc.).
"""

from typing import Any

from app.core.chat.stream_handlers import ThinkingEventHandler
from app.schemas.chat_event_types import ChatEventType


class MockMessageChunk:
    """Mock message chunk for testing thinking content extraction."""

    def __init__(
        self,
        content: str | list[dict[str, Any]] = "",
        additional_kwargs: dict[str, Any] | None = None,
        response_metadata: dict[str, Any] | None = None,
    ):
        self.content = content
        self.additional_kwargs = additional_kwargs or {}
        self.response_metadata = response_metadata or {}


class TestThinkingEventHandler:
    """Tests for ThinkingEventHandler event creation methods."""

    def test_create_thinking_start_event(self) -> None:
        """Verify thinking_start event has correct structure."""
        event = ThinkingEventHandler.create_thinking_start("stream_123")

        assert event["type"] == ChatEventType.THINKING_START
        assert event["data"]["id"] == "stream_123"

    def test_create_thinking_chunk_event(self) -> None:
        """Verify thinking_chunk event has correct structure."""
        event = ThinkingEventHandler.create_thinking_chunk("stream_123", "Let me think...")

        assert event["type"] == ChatEventType.THINKING_CHUNK
        assert event["data"]["id"] == "stream_123"
        assert event["data"]["content"] == "Let me think..."

    def test_create_thinking_end_event(self) -> None:
        """Verify thinking_end event has correct structure."""
        event = ThinkingEventHandler.create_thinking_end("stream_123")

        assert event["type"] == ChatEventType.THINKING_END
        assert event["data"]["id"] == "stream_123"


class TestExtractThinkingContent:
    """Tests for ThinkingEventHandler.extract_thinking_content method."""

    def test_extract_deepseek_reasoning_content(self) -> None:
        """Extract thinking from DeepSeek R1 style additional_kwargs.reasoning_content."""
        chunk = MockMessageChunk(
            content="",
            additional_kwargs={"reasoning_content": "Step 1: Analyze the problem..."},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result == "Step 1: Analyze the problem..."

    def test_extract_anthropic_thinking_block(self) -> None:
        """Extract thinking from Anthropic Claude style content blocks."""
        chunk = MockMessageChunk(
            content=[
                {"type": "thinking", "thinking": "Let me reason through this..."},
                {"type": "text", "text": "The answer is 42."},
            ]
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result == "Let me reason through this..."

    def test_extract_thinking_from_response_metadata(self) -> None:
        """Extract thinking from response_metadata.thinking."""
        chunk = MockMessageChunk(
            content="",
            response_metadata={"thinking": "I need to consider all factors..."},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result == "I need to consider all factors..."

    def test_extract_reasoning_content_from_response_metadata(self) -> None:
        """Extract from response_metadata.reasoning_content (alternative key)."""
        chunk = MockMessageChunk(
            content="",
            response_metadata={"reasoning_content": "Analyzing the data..."},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result == "Analyzing the data..."

    def test_no_thinking_content_returns_none(self) -> None:
        """Return None when no thinking content is present."""
        chunk = MockMessageChunk(
            content="Hello, world!",
            additional_kwargs={},
            response_metadata={},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result is None

    def test_empty_thinking_returns_none(self) -> None:
        """Return None for empty reasoning_content string."""
        chunk = MockMessageChunk(
            content="",
            additional_kwargs={"reasoning_content": ""},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result is None

    def test_deepseek_takes_priority_over_response_metadata(self) -> None:
        """DeepSeek additional_kwargs should be checked first."""
        chunk = MockMessageChunk(
            content="",
            additional_kwargs={"reasoning_content": "From additional_kwargs"},
            response_metadata={"thinking": "From response_metadata"},
        )

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result == "From additional_kwargs"

    def test_handles_missing_attributes_gracefully(self) -> None:
        """Handle objects without expected attributes."""

        class MinimalChunk:
            pass

        chunk = MinimalChunk()

        result = ThinkingEventHandler.extract_thinking_content(chunk)

        assert result is None
