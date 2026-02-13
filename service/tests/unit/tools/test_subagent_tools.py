"""Unit tests for subagent tool output collection."""

from typing import Any

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from app.tools.builtin.subagent.tools import _run_subagent


class _FakeGraph:
    """Minimal graph stub for testing _run_subagent streaming handling."""

    def __init__(self, events: list[tuple[str, Any]]) -> None:
        self._events = events

    async def astream(self, _state: dict[str, Any], stream_mode: list[str], config: dict[str, Any]) -> Any:
        _ = (stream_mode, config)
        for event in self._events:
            yield event


@pytest.mark.asyncio
async def test_run_subagent_collects_non_streaming_ai_message() -> None:
    graph = _FakeGraph(
        [
            ("messages", (AIMessage(content="final answer"), {})),
        ]
    )

    result = await _run_subagent(graph, "do task")

    assert result == "final answer"


@pytest.mark.asyncio
async def test_run_subagent_skips_duplicate_final_ai_message_after_streaming() -> None:
    graph = _FakeGraph(
        [
            ("messages", (AIMessageChunk(content="hel"), {})),
            ("messages", (AIMessageChunk(content="lo"), {})),
            ("messages", (AIMessage(content="hello"), {})),
        ]
    )

    result = await _run_subagent(graph, "do task")

    assert result == "hello"
