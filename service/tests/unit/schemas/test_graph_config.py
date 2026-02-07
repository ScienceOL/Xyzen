"""Tests for graph_config schema."""

from typing import Any

from pydantic import ValidationError

from app.schemas.graph_config import (
    GraphConfig,
    is_graph_config,
    parse_graph_config,
)


def _minimal_v3_config() -> dict[str, Any]:
    return {
        "schema_version": "3.0",
        "key": "react",
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
                        "prompt_template": "You are a helpful assistant.",
                        "tools_enabled": False,
                    },
                }
            ],
            "edges": [
                {
                    "from_node": "START",
                    "to_node": "agent",
                },
                {
                    "from_node": "agent",
                    "to_node": "END",
                },
            ],
        },
        "state": {
            "schema": {},
            "reducers": {},
        },
        "limits": {
            "max_time_s": 300,
            "max_steps": 64,
            "max_concurrency": 10,
        },
    }


class TestGraphConfig:
    """v3 schema tests."""

    def test_parse_minimal_valid_config(self) -> None:
        raw = _minimal_v3_config()
        parsed = parse_graph_config(raw)

        assert isinstance(parsed, GraphConfig)
        assert parsed.schema_version == "3.0"
        assert parsed.graph.entrypoints == ["agent"]

    def test_is_graph_config(self) -> None:
        assert is_graph_config(_minimal_v3_config()) is True
        assert is_graph_config({"version": "2.0"}) is False

    def test_reject_empty_entrypoints(self) -> None:
        raw = _minimal_v3_config()
        raw["graph"]["entrypoints"] = []

        try:
            parse_graph_config(raw)
            raise AssertionError("Expected validation error")
        except ValidationError as exc:
            assert "entrypoints" in str(exc)

    def test_reject_duplicate_entrypoints(self) -> None:
        raw = _minimal_v3_config()
        raw["graph"]["entrypoints"] = ["agent", "agent"]

        try:
            parse_graph_config(raw)
            raise AssertionError("Expected validation error")
        except ValidationError as exc:
            assert "must be unique" in str(exc)

    def test_reject_legacy_edge_target_field(self) -> None:
        raw = _minimal_v3_config()
        raw["graph"]["edges"][1]["when"] = {
            "state_path": "need_tool",
            "operator": "truthy",
            "target": "tools",
        }

        try:
            parse_graph_config(raw)
            raise AssertionError("Expected validation error")
        except ValidationError as exc:
            assert "target" in str(exc)

    def test_allow_prompt_config_for_phase1_compatibility(self) -> None:
        raw = _minimal_v3_config()
        raw["prompt_config"] = {
            "custom_instructions": "Be concise.",
        }

        parsed = parse_graph_config(raw)
        assert parsed.prompt_config is not None
        assert parsed.prompt_config.custom_instructions == "Be concise."

    def test_reject_unknown_top_level_field(self) -> None:
        raw = _minimal_v3_config()
        raw["version"] = "2.0"

        try:
            parse_graph_config(raw)
            raise AssertionError("Expected validation error")
        except ValidationError as exc:
            assert "version" in str(exc)
