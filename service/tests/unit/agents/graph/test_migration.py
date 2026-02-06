"""Tests for GraphConfig legacy -> canonical migration helpers."""

import pytest

from app.agents.graph.upgrader import (
    GraphConfigMigrationError,
    upgrade_graph_config,
    upgrade_or_create_default_graph_config,
)
from app.schemas.graph_config_legacy import create_react_config


def _simple_v1_config() -> dict:
    return {
        "version": "1.0",
        "nodes": [
            {
                "id": "agent",
                "name": "Agent",
                "type": "llm",
                "llm_config": {
                    "prompt_template": "You are helpful.",
                    "output_key": "response",
                },
            }
        ],
        "edges": [
            {"from_node": "START", "to_node": "agent"},
            {"from_node": "agent", "to_node": "END"},
        ],
        "entry_point": "agent",
    }


def test_migrate_v2_config() -> None:
    raw = create_react_config("You are helpful.").model_dump()

    result = upgrade_graph_config(raw)

    assert result.source_version == "2.0"
    assert result.config.schema_version == "3.0"
    assert result.config.graph.entrypoints == ["agent"]
    assert any(edge.from_node == "agent" and edge.to_node == "END" for edge in result.config.graph.edges)


def test_migrate_v1_config() -> None:
    result = upgrade_graph_config(_simple_v1_config())

    assert result.source_version == "1.0"
    assert result.config.schema_version == "3.0"
    assert any(w.code == "UPGRADED_V1_TO_V2" for w in result.warnings)


def test_invalid_entrypoint_falls_back_to_start_edge_target() -> None:
    raw = create_react_config("prompt").model_dump()
    raw["entry_point"] = "missing"

    result = upgrade_graph_config(raw)

    assert result.config.graph.entrypoints == ["agent"]
    assert any(w.code == "INVALID_ENTRYPOINT_FALLBACK" for w in result.warnings)


def test_empty_graph_is_hard_error() -> None:
    with pytest.raises(GraphConfigMigrationError, match="EMPTY_GRAPH"):
        upgrade_graph_config(
            {
                "version": "2.0",
                "nodes": [],
                "edges": [],
            }
        )


def test_missing_predicate_state_key_is_hard_error() -> None:
    raw = {
        "version": "2.0",
        "nodes": [
            {
                "id": "agent",
                "name": "Agent",
                "type": "llm",
                "llm_config": {"prompt_template": "hello"},
            }
        ],
        "edges": [
            {"from_node": "START", "to_node": "agent"},
            {
                "from_node": "agent",
                "to_node": "END",
                "condition": {
                    "state_key": "",
                    "operator": "eq",
                    "value": True,
                    "target": "END",
                },
            },
        ],
        "entry_point": "agent",
    }

    with pytest.raises(GraphConfigMigrationError, match="MISSING_PREDICATE_STATE_KEY"):
        upgrade_graph_config(raw)


def test_null_graph_config_uses_default_react() -> None:
    result = upgrade_or_create_default_graph_config(None, agent_prompt="My prompt")

    assert result.source_version == "null"
    assert result.config.schema_version == "3.0"
    assert result.config.graph.entrypoints == ["agent"]
    assert any(w.code == "DEFAULT_GRAPH_FROM_NULL" for w in result.warnings)
