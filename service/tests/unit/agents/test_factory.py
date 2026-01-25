"""Tests for agent factory module."""

from app.agents.factory import _inject_system_prompt


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

        # Result should have the new prompt
        assert result["nodes"][0]["llm_config"]["prompt_template"] == "Custom system prompt"

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

        # Both nodes should be updated (inject into all matching nodes)
        assert result["nodes"][0]["llm_config"]["prompt_template"] == "Custom system prompt"
        assert result["nodes"][1]["llm_config"]["prompt_template"] == "Custom system prompt"

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

        # LLM node should be updated (other component is not react)
        assert result["nodes"][1]["llm_config"]["prompt_template"] == "Custom system prompt"

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
