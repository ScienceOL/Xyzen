"""Unit tests for tool response status mapping in langchain stream handling."""

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import ToolMessage

from app.core.chat.langchain import _handle_updates_mode
from app.core.chat.stream_handlers import StreamContext
from app.schemas.chat_event_types import ChatEventType
from app.tools.builtin.subagent.schemas import SpawnSubagentOutcome


class _TracerStub:
    """Minimal tracer stub for _handle_updates_mode tests."""

    def get_current_node_id(self) -> str | None:
        return None

    def on_node_end(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def on_node_start(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def record_node_output(self, *_args: Any, **_kwargs: Any) -> None:
        return None


async def _collect_tool_events(raw_content: Any, tool_name: str) -> list[dict[str, Any]]:
    """Run _handle_updates_mode with a single ToolMessage and collect events."""
    ctx = StreamContext(
        stream_id="stream-1",
        db=MagicMock(),
        user_id="u1",
    )
    tracer = _TracerStub()
    msg = ToolMessage(
        content=raw_content,
        tool_call_id="tool-call-1",
        name=tool_name,
    )
    data = {"tools": {"messages": [msg]}}
    return [event async for event in _handle_updates_mode(data, ctx, tracer)]


@pytest.mark.asyncio
async def test_subagent_failed_outcome_marks_tool_response_failed() -> None:
    outcome = SpawnSubagentOutcome(
        ok=False,
        error_code="agent.timeout",
        error_message="Subagent timed out.",
        output="",
        duration_ms=12,
    )
    events = await _collect_tool_events(outcome.model_dump_json(), "spawn_subagent")

    assert len(events) == 1
    event = events[0]
    assert event["type"] == ChatEventType.TOOL_CALL_RESPONSE
    assert event["data"]["status"] == "failed"
    assert event["data"]["error"] == "Subagent timed out."


@pytest.mark.asyncio
async def test_subagent_success_outcome_marks_tool_response_completed() -> None:
    outcome = SpawnSubagentOutcome(
        ok=True,
        output="delegate result",
        duration_ms=8,
    )
    events = await _collect_tool_events(outcome.model_dump_json(), "spawn_subagent")

    assert len(events) == 1
    event = events[0]
    assert event["type"] == ChatEventType.TOOL_CALL_RESPONSE
    assert event["data"]["status"] == "completed"
    assert event["data"]["result"] == {"success": True, "data": "delegate result"}
    assert "error" not in event["data"]


@pytest.mark.asyncio
async def test_structured_error_payload_marks_non_subagent_failed() -> None:
    events = await _collect_tool_events('{"error": "tool exploded"}', "web_search")

    assert len(events) == 1
    event = events[0]
    assert event["type"] == ChatEventType.TOOL_CALL_RESPONSE
    assert event["data"]["status"] == "failed"
    assert event["data"]["error"] == "tool exploded"
