"""Tests for GraphConfig v3 validator."""

from typing import Any

from app.agents.graph.validator import validate_graph_config
from app.schemas.graph_config import parse_graph_config


def _base_config() -> dict[str, Any]:
    return {
        "schema_version": "3.0",
        "key": "test_agent",
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
                    "config": {"prompt_template": "You are helpful.", "tools_enabled": False},
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


def test_validator_accepts_valid_graph() -> None:
    config = parse_graph_config(_base_config())
    errors = validate_graph_config(config)
    assert errors == []


def test_validator_rejects_start_edges() -> None:
    raw = _base_config()
    raw["graph"]["edges"].insert(0, {"from_node": "START", "to_node": "agent"})

    config = parse_graph_config(raw)
    errors = validate_graph_config(config)

    assert any(error.code == "EDGE_FROM_START_FORBIDDEN" for error in errors)


def test_validator_rejects_missing_predicate_state_key() -> None:
    raw = _base_config()
    raw["graph"]["edges"][0]["when"] = {
        "state_path": "not_defined",
        "operator": "truthy",
    }

    config = parse_graph_config(raw)
    errors = validate_graph_config(config)

    assert any(error.code == "PREDICATE_STATE_PATH_MISSING" for error in errors)


def test_validator_rejects_unreachable_node() -> None:
    raw = _base_config()
    raw["graph"]["nodes"].append(
        {
            "id": "orphan",
            "kind": "transform",
            "name": "Orphan",
            "reads": [],
            "writes": ["output"],
            "config": {"template": "{{ state }}", "output_key": "output"},
        }
    )

    config = parse_graph_config(raw)
    errors = validate_graph_config(config)

    assert any(error.code == "UNREACHABLE_NODE" for error in errors)


def test_validator_rejects_end_unreachable() -> None:
    raw = _base_config()
    raw["graph"]["edges"] = [{"from_node": "agent", "to_node": "agent"}]

    config = parse_graph_config(raw)
    errors = validate_graph_config(config)

    assert any(error.code == "END_UNREACHABLE" for error in errors)
