"""
Default prompt configuration and helper functions.

Provides factory functions for extracting PromptConfig from agent graph_config
with proper fallbacks and backward compatibility.
"""

from typing import Any

from app.schemas.prompt_config import PromptConfig

# The default PromptConfig instance - used when no config is specified
DEFAULT_PROMPT_CONFIG = PromptConfig()


def get_prompt_config_from_graph_config(
    graph_config: dict[str, Any] | None,
    agent_prompt: str | None = None,
) -> PromptConfig:
    """
    Extract and validate PromptConfig from graph_config.

    Falls back to defaults for missing values.
    Maintains backward compatibility with agent.prompt field.

    Args:
        graph_config: The agent's graph_config dict (may be None)
        agent_prompt: The agent's legacy prompt field (for backward compatibility)

    Returns:
        PromptConfig instance with all settings resolved
    """
    if not graph_config:
        config = PromptConfig()
    else:
        prompt_config_dict = graph_config.get("prompt_config", {})
        if prompt_config_dict:
            config = PromptConfig.model_validate(prompt_config_dict)
        else:
            config = PromptConfig()

    # Backward compatibility: if agent.prompt is set but custom_instructions is not
    if agent_prompt and not config.custom_instructions:
        # Create a new config with the agent_prompt as custom_instructions
        config = config.model_copy(update={"custom_instructions": agent_prompt})

    return config


def merge_prompt_configs(base: PromptConfig, override: PromptConfig) -> PromptConfig:
    """
    Merge two PromptConfig instances, with override taking precedence.

    Useful for layering system defaults with user customizations.

    Args:
        base: Base configuration
        override: Override configuration (non-None values take precedence)

    Returns:
        Merged PromptConfig
    """
    base_dict = base.model_dump()
    override_dict = override.model_dump(exclude_none=True, exclude_defaults=True)

    # Deep merge for nested configs
    for key, value in override_dict.items():
        if isinstance(value, dict) and key in base_dict and isinstance(base_dict[key], dict):
            base_dict[key].update(value)
        else:
            base_dict[key] = value

    return PromptConfig.model_validate(base_dict)


def get_display_prompt_from_config(config: dict[str, Any]) -> str | None:
    """
    Extract display prompt from snapshot configuration for UI purposes.

    Priority:
    1. graph_config.prompt_config.custom_instructions
    2. Legacy prompt field

    Args:
        config: The snapshot configuration dict

    Returns:
        The display prompt string or None if not found
    """
    # Priority 1: Check graph_config.prompt_config.custom_instructions
    graph_config = config.get("graph_config")
    if graph_config:
        prompt_config = graph_config.get("prompt_config", {})
        if custom_instructions := prompt_config.get("custom_instructions"):
            return custom_instructions

    # Priority 2: Legacy prompt field
    return config.get("prompt")


__all__ = [
    "DEFAULT_PROMPT_CONFIG",
    "get_prompt_config_from_graph_config",
    "merge_prompt_configs",
    "get_display_prompt_from_config",
]
