"""
Prompt Builder for constructing system prompts from blocks.

Uses a modular builder pattern with configurable blocks driven by PromptConfig.
Supports backward compatibility with legacy agent.prompt field.
"""

from dataclasses import dataclass
from abc import ABC, abstractmethod
from typing import Any

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.prompts.blocks import (
    ContextBlock,
    FormatBlock,
    MetaInstructionBlock,
    PersonaBlock,
    PromptBlock,
    ToolInstructionBlock,
)
from app.core.prompts.defaults import get_prompt_config_from_graph_config
from app.models.agent import Agent
from app.schemas.prompt_config import PromptConfig


@dataclass(frozen=True)
class SystemPromptBuildResult:
    """Built prompt text and non-sensitive provenance metadata."""

    prompt: str
    provenance: dict[str, Any]


class BasePromptBuilder(ABC):
    """Abstract builder for prompts."""

    def __init__(self, config: PromptConfig):
        self._blocks: list[PromptBlock] = []
        self._config = config

    def add_block(self, block: PromptBlock) -> "BasePromptBuilder":
        self._blocks.append(block)
        return self

    def build(self) -> str:
        return "".join([block.build() for block in self._blocks])

    @abstractmethod
    def construct_prompt(self, agent: Agent | None, model_name: str | None) -> "BasePromptBuilder":
        pass


class TextModelPromptBuilder(BasePromptBuilder):
    """Builder for text-based models using 4-layer strategy."""

    def construct_prompt(self, agent: Agent | None, model_name: str | None) -> "TextModelPromptBuilder":
        # Layer 1: System Meta-Instructions (Identity, Branding, Security, Safety)
        self.add_block(MetaInstructionBlock(self._config))

        # Layer 2: Dynamic Context (Runtime Injection - Date, Time, Custom)
        self.add_block(ContextBlock(self._config))

        # Layer 3: Tool & Function Instructions (Knowledge Base)
        self.add_block(ToolInstructionBlock(self._config, agent))

        # Layer 4: Persona / Custom User Instructions
        self.add_block(PersonaBlock(self._config))

        # Extra: Formatting Instructions
        self.add_block(FormatBlock(self._config, model_name))

        return self


class ImageModelPromptBuilder(BasePromptBuilder):
    """Builder for image generation models (Simplified)."""

    def construct_prompt(self, agent: Agent | None, model_name: str | None) -> "ImageModelPromptBuilder":
        # Image models only need custom instructions (persona)
        self.add_block(PersonaBlock(self._config))

        return self


def _is_image_model(model_name: str | None) -> bool:
    if not model_name:
        return False
    lowered = model_name.lower()
    return "image" in lowered or "vision" in lowered or "dall-e" in lowered


def _join_non_empty(parts: list[str]) -> str:
    cleaned = [part.strip() for part in parts if part.strip()]
    return "\n\n".join(cleaned)


def _build_prompt_layers(config: PromptConfig, agent: Agent | None, model_name: str | None) -> tuple[str, str]:
    """Build platform and agent prompt layers independently."""

    agent_layer = PersonaBlock(config).build().strip()

    if _is_image_model(model_name):
        return "", agent_layer

    platform_parts = [
        MetaInstructionBlock(config).build(),
        ContextBlock(config).build(),
        ToolInstructionBlock(config, agent).build(),
        FormatBlock(config, model_name).build(),
    ]
    platform_layer = _join_non_empty(platform_parts)
    return platform_layer, agent_layer


def _build_prompt_provenance(
    graph_config: dict[str, Any] | None,
    agent_prompt: str | None,
    platform_prompt: str,
    agent_prompt_layer: str,
    final_prompt: str,
    model_name: str | None,
) -> dict[str, Any]:
    prompt_config_raw: Any = graph_config.get("prompt_config", {}) if graph_config else {}
    custom_instructions: str | None = None
    if isinstance(prompt_config_raw, dict):
        raw_custom = prompt_config_raw.get("custom_instructions")
        if isinstance(raw_custom, str):
            custom_instructions = raw_custom
    has_graph_custom = bool(custom_instructions and custom_instructions.strip())

    return {
        "layer_order": ["platform_policy_prompt", "agent_prompt", "node_prompt"],
        "model_name": model_name,
        "has_platform_policy_prompt": bool(platform_prompt),
        "has_agent_prompt": bool(agent_prompt_layer),
        "agent_prompt_source": "graph_config.prompt_config"
        if has_graph_custom
        else ("agent.prompt_fallback" if agent_prompt and agent_prompt_layer else "none"),
        "platform_policy_chars": len(platform_prompt),
        "agent_prompt_chars": len(agent_prompt_layer),
        "final_system_prompt_chars": len(final_prompt),
    }


async def build_system_prompt_with_provenance(
    db: AsyncSession, agent: Agent | None, model_name: str | None
) -> SystemPromptBuildResult:
    """
    Build system prompt for the agent using the modular builder.

    Extracts PromptConfig from agent's graph_config with fallbacks:
    1. graph_config.prompt_config (if present)
    2. Default PromptConfig (if no config)
    3. Backward compat: agent.prompt → custom_instructions

    Args:
        db: Database session (for future extensibility)
        agent: Agent configuration (may be None)
        model_name: Model name for format customization

    Returns:
        SystemPromptBuildResult with prompt text and provenance summary
    """
    _ = db  # reserved for future prompt/data hydration

    # Extract prompt config from graph_config (with backward compatibility)
    graph_config = agent.graph_config if agent else None
    agent_prompt = agent.prompt if agent else None
    prompt_config = get_prompt_config_from_graph_config(graph_config, agent_prompt)

    platform_prompt, resolved_agent_prompt = _build_prompt_layers(prompt_config, agent, model_name)
    final_prompt = _join_non_empty([platform_prompt, resolved_agent_prompt])

    provenance = _build_prompt_provenance(
        graph_config=graph_config,
        agent_prompt=agent_prompt,
        platform_prompt=platform_prompt,
        agent_prompt_layer=resolved_agent_prompt,
        final_prompt=final_prompt,
        model_name=model_name,
    )
    return SystemPromptBuildResult(prompt=final_prompt, provenance=provenance)


async def build_system_prompt(db: AsyncSession, agent: Agent | None, model_name: str | None) -> str:
    """Build complete system prompt string (compat facade)."""

    result = await build_system_prompt_with_provenance(db, agent, model_name)
    return result.prompt
