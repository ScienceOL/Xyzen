"""Unit tests for agent management tool graph-config creation helpers."""

from app.tools.builtin.agent_management.tools import _build_simple_react_graph_config


def _main_llm_node(graph_config: dict) -> dict:
    nodes = graph_config.get("graph", {}).get("nodes", [])
    return next(node for node in nodes if node.get("kind") == "llm" and node.get("id") == "agent")


def test_build_simple_react_graph_config_sets_prompt_and_model() -> None:
    graph_config = _build_simple_react_graph_config(
        prompt="你是小智，请使用中文回答。",
        model="gpt-4o",
    )

    assert graph_config["schema_version"] == "3.0"
    assert graph_config["prompt_config"]["custom_instructions"] == "你是小智，请使用中文回答。"
    assert graph_config["ui"]["builtin_key"] == "react"

    llm_config = _main_llm_node(graph_config)["config"]
    assert llm_config["model_override"] == "gpt-4o"


def test_build_simple_react_graph_config_without_model_keeps_graph_clean() -> None:
    graph_config = _build_simple_react_graph_config(
        prompt="",
        model="",
    )

    assert graph_config["prompt_config"]["custom_instructions"] == ""
    llm_config = _main_llm_node(graph_config)["config"]
    assert llm_config.get("model_override") is None
