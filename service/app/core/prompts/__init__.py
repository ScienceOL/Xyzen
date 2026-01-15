"""
Core prompt system.

Provides JSON-configurable prompt building with:
- PromptConfig schema for structured configuration
- Modular prompt blocks (identity, security, safety, formatting)
- Backward compatibility with legacy agent.prompt field
"""

from app.core.prompts.builder import build_system_prompt
from app.core.prompts.defaults import (
    DEFAULT_PROMPT_CONFIG,
    get_prompt_config_from_graph_config,
    merge_prompt_configs,
)

__all__ = [
    "build_system_prompt",
    "DEFAULT_PROMPT_CONFIG",
    "get_prompt_config_from_graph_config",
    "merge_prompt_configs",
]
