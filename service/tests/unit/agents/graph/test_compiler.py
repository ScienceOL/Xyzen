"""Tests for GraphConfig compiler."""

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agents.graph.compiler import GraphCompiler
from app.schemas.graph_config import parse_graph_config


def _simple_v3_config() -> dict[str, Any]:
    return {
        "schema_version": "3.0",
        "key": "compiler_test",
        "revision": 1,
        "graph": {
            "entrypoints": ["agent"],
            "nodes": [
                {
                    "id": "agent",
                    "kind": "llm",
                    "name": "Agent",
                    "reads": ["messages"],
                    "writes": ["messages", "response"],
                    "config": {
                        "prompt_template": "You are helpful.",
                        "tools_enabled": False,
                    },
                }
            ],
            "edges": [
                {
                    "from_node": "agent",
                    "to_node": "END",
                }
            ],
        },
        "state": {"schema": {}, "reducers": {}},
        "limits": {"max_time_s": 300, "max_steps": 64, "max_concurrency": 10},
    }


@pytest.mark.asyncio
async def test_compiler_builds_and_runs_simple_graph() -> None:
    config = parse_graph_config(_simple_v3_config())

    async def mock_llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
        _ = (model, temperature)
        mock_llm = MagicMock()

        async def ainvoke(_messages: list[Any]) -> AIMessage:
            return AIMessage(content="ok")

        mock_llm.ainvoke = ainvoke
        return mock_llm

    compiler = GraphCompiler(
        config=config,
        llm_factory=mock_llm_factory,
        tool_registry={},
    )

    graph = await compiler.build()
    result = await graph.ainvoke({"messages": [HumanMessage(content="hello")]})  # type: ignore[arg-type]

    assert "messages" in result


def test_compiler_rejects_invalid_graph() -> None:
    raw = _simple_v3_config()
    raw["graph"]["edges"][0]["when"] = {
        "state_path": "missing_in_state_schema",
        "operator": "truthy",
    }
    config = parse_graph_config(raw)

    with pytest.raises(ValueError):
        GraphCompiler(
            config=config,
            llm_factory=MagicMock(),
            tool_registry={},
        )
