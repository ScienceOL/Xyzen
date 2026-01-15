"""
Prompt Builder for constructing system prompts from blocks.

Uses a modular builder pattern with configurable blocks driven by PromptConfig.
Supports backward compatibility with legacy agent.prompt field.
"""

from abc import ABC, abstractmethod

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


async def build_system_prompt(db: AsyncSession, agent: Agent | None, model_name: str | None) -> str:
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
        Complete system prompt string
    """
    # Extract prompt config from graph_config (with backward compatibility)
    graph_config = agent.graph_config if agent else None
    agent_prompt = agent.prompt if agent else None
    prompt_config = get_prompt_config_from_graph_config(graph_config, agent_prompt)

    # Select builder based on model type
    if model_name and ("image" in model_name or "vision" in model_name or "dall-e" in model_name):
        builder = ImageModelPromptBuilder(prompt_config)
    else:
        builder = TextModelPromptBuilder(prompt_config)

    builder.construct_prompt(agent, model_name)

    return builder.build()
