"""Unit tests for subagent tool behavior."""

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage

from app.tools.builtin.subagent.tools import _run_subagent, create_subagent_tool_for_session


class _FakeGraph:
    """Minimal graph stub for testing _run_subagent final-state handling."""

    def __init__(self, state: dict[str, Any]) -> None:
        self._state = state

    async def ainvoke(self, _state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        _ = config
        return self._state


@pytest.mark.asyncio
async def test_run_subagent_collects_non_streaming_ai_message() -> None:
    graph = _FakeGraph({"messages": [AIMessage(content="final answer")]})

    result = await _run_subagent(graph, "do task")

    assert result == "final answer"


@pytest.mark.asyncio
async def test_run_subagent_returns_last_non_tool_ai_message() -> None:
    graph = _FakeGraph(
        {
            "messages": [
                AIMessage(content="first answer"),
                AIMessage(content="", tool_calls=[{"id": "tool_1", "name": "t", "args": {}}]),
                AIMessage(content="final answer"),
            ]
        }
    )

    result = await _run_subagent(graph, "do task")

    assert result == "final answer"


@pytest.mark.asyncio
async def test_run_subagent_extracts_text_from_block_content() -> None:
    graph = _FakeGraph(
        {
            "messages": [
                AIMessage(
                    content=[
                        {"type": "text", "text": "alpha "},
                        {"type": "text", "text": "beta"},
                    ]
                )
            ]
        }
    )

    result = await _run_subagent(graph, "do task")

    assert result == "alpha beta"


@pytest.mark.asyncio
async def test_create_subagent_tool_requires_session_factory_context() -> None:
    with pytest.raises(RuntimeError, match="requires session factory context"):
        await create_subagent_tool_for_session(
            db=MagicMock(),
            user_id="u1",
            session_id=None,
            topic_id=None,
            user_provider_manager=MagicMock(),
            provider_id=None,
            model_name="gpt-4o",
            current_depth=0,
            store=None,
        )
