"""Unit tests for subagent tool behavior."""

import asyncio
from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage

from app.tools.builtin.subagent import context as subagent_context
from app.tools.builtin.subagent.schemas import parse_subagent_outcome
from app.tools.builtin.subagent import tools as subagent_tools
from app.tools.builtin.subagent.tools import _run_subagent, create_subagent_tool_for_session


class _FakeGraph:
    """Minimal graph stub for testing _run_subagent final-state handling."""

    def __init__(self, state: dict[str, Any]) -> None:
        self._state = state

    async def ainvoke(self, _state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        _ = config
        return self._state


class _DummySessionContext:
    """Minimal async context manager returned by the fake session factory."""

    async def __aenter__(self) -> MagicMock:
        return MagicMock()

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> bool:
        _ = (exc_type, exc, tb)
        return False


def _fake_session_factory() -> _DummySessionContext:
    return _DummySessionContext()


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


@pytest.mark.asyncio
async def test_spawn_subagent_timeout_returns_structured_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subagent_context, "get_session_factory", lambda: _fake_session_factory)
    monkeypatch.setattr(subagent_tools, "SUBAGENT_TIMEOUT_SECONDS", 0)

    async def _build_graph_stub(**_kwargs: Any) -> object:
        return object()

    async def _run_subagent_stub(_graph: object, _task: str) -> str:
        await asyncio.sleep(0.01)
        return "never reached"

    monkeypatch.setattr(subagent_tools, "_build_subagent_graph", _build_graph_stub)
    monkeypatch.setattr(subagent_tools, "_run_subagent", _run_subagent_stub)

    raw = await subagent_tools._spawn_subagent_impl(
        task="do work",
        user_id="u1",
        session_id=None,
        topic_id=None,
        user_provider_manager=MagicMock(),
        provider_id=None,
        model_name=None,
        current_depth=0,
        store=None,
        attempt_index=1,
    )
    outcome = parse_subagent_outcome(raw)

    assert outcome is not None
    assert outcome.ok is False
    assert outcome.error_code == "agent.timeout"
    assert outcome.error_message


@pytest.mark.asyncio
async def test_spawn_subagent_recursion_limit_returns_structured_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(subagent_context, "get_session_factory", lambda: _fake_session_factory)

    async def _build_graph_stub(**_kwargs: Any) -> object:
        return object()

    async def _run_subagent_stub(_graph: object, _task: str) -> str:
        raise RuntimeError("recursion limit reached")

    monkeypatch.setattr(subagent_tools, "_build_subagent_graph", _build_graph_stub)
    monkeypatch.setattr(subagent_tools, "_run_subagent", _run_subagent_stub)

    raw = await subagent_tools._spawn_subagent_impl(
        task="do work",
        user_id="u1",
        session_id=None,
        topic_id=None,
        user_provider_manager=MagicMock(),
        provider_id=None,
        model_name=None,
        current_depth=0,
        store=None,
        attempt_index=1,
    )
    outcome = parse_subagent_outcome(raw)

    assert outcome is not None
    assert outcome.ok is False
    assert outcome.error_code == "agent.recursion_limit"
    assert outcome.error_message == "Subagent reached recursion limit."


@pytest.mark.asyncio
async def test_spawn_subagent_success_returns_structured_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subagent_context, "get_session_factory", lambda: _fake_session_factory)

    async def _build_graph_stub(**_kwargs: Any) -> object:
        return object()

    async def _run_subagent_stub(_graph: object, _task: str) -> str:
        return "final answer"

    monkeypatch.setattr(subagent_tools, "_build_subagent_graph", _build_graph_stub)
    monkeypatch.setattr(subagent_tools, "_run_subagent", _run_subagent_stub)

    raw = await subagent_tools._spawn_subagent_impl(
        task="do work",
        user_id="u1",
        session_id=None,
        topic_id=None,
        user_provider_manager=MagicMock(),
        provider_id=None,
        model_name=None,
        current_depth=0,
        store=None,
        attempt_index=1,
    )
    outcome = parse_subagent_outcome(raw)

    assert outcome is not None
    assert outcome.ok is True
    assert outcome.output == "final answer"
    assert outcome.error_code is None


@pytest.mark.asyncio
async def test_create_subagent_tool_enforces_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subagent_context, "get_session_factory", lambda: _fake_session_factory)

    async def _spawn_impl_stub(**kwargs: Any) -> str:
        attempt_index = kwargs["attempt_index"]
        return subagent_tools._serialize_subagent_outcome(
            ok=True,
            output=f"attempt-{attempt_index}",
            duration_ms=1,
        )

    monkeypatch.setattr(subagent_tools, "_spawn_subagent_impl", _spawn_impl_stub)

    tools = await create_subagent_tool_for_session(
        db=MagicMock(),
        user_id="u1",
        session_id=None,
        topic_id=None,
        user_provider_manager=MagicMock(),
        provider_id=None,
        model_name=None,
        current_depth=0,
        store=None,
    )

    assert len(tools) == 1
    tool = tools[0]

    first = parse_subagent_outcome(await tool.ainvoke({"task": "first"}))
    second = parse_subagent_outcome(await tool.ainvoke({"task": "second"}))
    third = parse_subagent_outcome(await tool.ainvoke({"task": "third"}))

    assert first is not None and first.ok is True
    assert second is not None and second.ok is True
    assert third is not None
    assert third.ok is False
    assert third.error_code == "tool.execution_failed"
