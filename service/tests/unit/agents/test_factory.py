"""Tests for agent factory module."""

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agents.factory import _build_graph_agent, _inject_system_prompt


class TestInjectSystemPrompt:
    """Test _inject_system_prompt function."""

    def test_inject_into_llm_node(self) -> None:
        """Test system prompt injection into LLM node."""
        config_dict = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "Default prompt",
                        "tools_enabled": True,
                    },
                },
            ],
            "edges": [],
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")

        # Original should not be mutated
        assert config_dict["nodes"][0]["llm_config"]["prompt_template"] == "Default prompt"

        # Result should layer system prompt + node prompt (not overwrite node prompt)
        layered = result["nodes"][0]["llm_config"]["prompt_template"]
        assert layered.startswith("Custom system prompt")
        assert "Default prompt" in layered
        assert "<NODE_PROMPT>" in layered

    def test_inject_into_component_node(self) -> None:
        """Test system prompt injection into react component node."""
        config_dict = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent",
                    "type": "component",
                    "component_config": {
                        "component_ref": {"key": "react"},
                    },
                },
            ],
            "edges": [],
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")

        # Original should not be mutated
        assert "config_overrides" not in config_dict["nodes"][0]["component_config"]

        # Result should have config_overrides with system_prompt
        assert result["nodes"][0]["component_config"]["config_overrides"]["system_prompt"] == "Custom system prompt"

    def test_inject_into_all_matching_nodes(self) -> None:
        """Test that system prompt is injected into all matching nodes."""
        config_dict = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent1",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "Prompt 1",
                    },
                },
                {
                    "id": "agent2",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "Prompt 2",
                    },
                },
            ],
            "edges": [],
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")

        # Both nodes should be layered (inject into all matching nodes)
        first = result["nodes"][0]["llm_config"]["prompt_template"]
        second = result["nodes"][1]["llm_config"]["prompt_template"]
        assert first.startswith("Custom system prompt")
        assert second.startswith("Custom system prompt")
        assert "Prompt 1" in first
        assert "Prompt 2" in second

    def test_llm_node_takes_precedence_over_non_react_component(self) -> None:
        """Test that LLM nodes are preferred over non-react components."""
        config_dict = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "other",
                    "type": "component",
                    "component_config": {
                        "component_ref": {"key": "other_component"},
                    },
                },
                {
                    "id": "agent",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "Default",
                    },
                },
            ],
            "edges": [],
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")

        # LLM node should be layered (other component is not react)
        layered = result["nodes"][1]["llm_config"]["prompt_template"]
        assert layered.startswith("Custom system prompt")
        assert "Default" in layered

    def test_no_matching_nodes(self) -> None:
        """Test graceful handling when no matching nodes exist."""
        config_dict = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "transform",
                    "type": "transform",
                },
            ],
            "edges": [],
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")

        # Should return config unchanged
        assert result == config_dict

    def test_inject_into_v3_llm_node(self) -> None:
        """Test system prompt injection into v3 LLM node shape."""
        config_dict = {
            "schema_version": "3.0",
            "key": "test",
            "graph": {
                "nodes": [
                    {
                        "id": "agent",
                        "kind": "llm",
                        "config": {
                            "prompt_template": "Default prompt",
                        },
                    }
                ]
            },
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")
        nodes = result["graph"]["nodes"]
        layered = nodes[0]["config"]["prompt_template"]
        assert layered.startswith("Custom system prompt")
        assert "Default prompt" in layered

    def test_inject_into_v3_component_node(self) -> None:
        """Test system prompt injection into v3 component node shape."""
        config_dict = {
            "schema_version": "3.0",
            "key": "test",
            "graph": {
                "nodes": [
                    {
                        "id": "planner",
                        "kind": "component",
                        "config": {
                            "component_ref": {"key": "deep_research:brief", "version": "*"},
                        },
                    }
                ]
            },
        }

        result = _inject_system_prompt(config_dict, "Custom system prompt")
        nodes = result["graph"]["nodes"]
        assert nodes[0]["config"]["config_overrides"]["system_prompt"] == "Custom system prompt"


class TestBuildGraphAgent:
    """Test routing in _build_graph_agent."""

    @pytest.mark.asyncio
    async def test_build_graph_agent_with_v3_config(self) -> None:
        raw_config = {
            "schema_version": "3.0",
            "key": "test_v3",
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
                "edges": [{"from_node": "agent", "to_node": "END"}],
            },
            "state": {"schema": {}, "reducers": {}},
            "limits": {"max_time_s": 300, "max_steps": 64, "max_concurrency": 10},
        }

        async def llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
            _ = (model, temperature)
            mock_llm = MagicMock()

            async def ainvoke(_messages: list[Any]) -> AIMessage:
                return AIMessage(content="ok")

            mock_llm.ainvoke = ainvoke
            return mock_llm

        compiled_graph, node_component_keys = await _build_graph_agent(
            raw_config=raw_config,
            llm_factory=llm_factory,
            tools=[],
            system_prompt="",
        )

        assert node_component_keys == {}
        result = await compiled_graph.ainvoke({"messages": [HumanMessage(content="hello")]})  # type: ignore[arg-type]
        assert "messages" in result

    @pytest.mark.asyncio
    async def test_build_graph_agent_with_v2_config_rejected(self) -> None:
        raw_config = {
            "version": "2.0",
            "nodes": [
                {
                    "id": "agent",
                    "name": "Agent",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "You are helpful.",
                        "tools_enabled": False,
                    },
                }
            ],
            "edges": [
                {"from_node": "START", "to_node": "agent"},
                {"from_node": "agent", "to_node": "END"},
            ],
            "entry_point": "agent",
        }

        async def llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
            _ = (model, temperature)
            mock_llm = MagicMock()

            async def ainvoke(_messages: list[Any]) -> AIMessage:
                return AIMessage(content="ok")

            mock_llm.ainvoke = ainvoke
            return mock_llm

        with pytest.raises(Exception):
            await _build_graph_agent(
                raw_config=raw_config,
                llm_factory=llm_factory,
                tools=[],
                system_prompt="",
            )
