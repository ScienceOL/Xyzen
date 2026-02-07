"""Tests for builtin agent GraphConfig v3 payloads."""

from app.agents.builtin import get_builtin_config, list_builtin_keys
from app.agents.graph.validator import ensure_valid_graph_config


def test_builtin_configs_are_v3_and_valid() -> None:
    for key in list_builtin_keys():
        config = get_builtin_config(key)
        assert config is not None
        assert config.schema_version == "3.0"
        ensure_valid_graph_config(config)

        payload = config.model_dump(exclude_none=True)
        metadata = payload.get("metadata", {})
        assert "builtin_key" not in metadata
        assert "system_agent_key" not in metadata
