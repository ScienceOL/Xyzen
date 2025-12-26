"""
Prompt Builder for constructing system prompts from blocks.
"""

from abc import ABC, abstractmethod
from typing import List, Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.prompts.blocks import (
    ContextBlock,
    FormatBlock,
    MetaInstructionBlock,
    PersonaBlock,
    PromptBlock,
    ToolInstructionBlock,
)
from app.models.agent import Agent


class BasePromptBuilder(ABC):
    """Abstract builder for prompts."""

    def __init__(self):
        self._blocks: List[PromptBlock] = []

    def add_block(self, block: PromptBlock) -> "BasePromptBuilder":
        self._blocks.append(block)
        return self

    def build(self) -> str:
        return "".join([block.build() for block in self._blocks])

    @abstractmethod
    def construct_prompt(self, agent: Optional[Agent], model_name: str | None) -> "BasePromptBuilder":
        pass


class TextModelPromptBuilder(BasePromptBuilder):
    """Builder for text-based models using 4-layer strategy."""

    def construct_prompt(self, agent: Optional[Agent], model_name: str | None) -> "TextModelPromptBuilder":
        # Layer 1: System Meta-Instructions (Immutable)
        self.add_block(MetaInstructionBlock())

        # Layer 2: Dynamic Context (Runtime Injection)
        self.add_block(ContextBlock())

        # Layer 3: Tool & Function Instructions
        self.add_block(ToolInstructionBlock(agent))

        # Layer 4: Persona / User Instructions
        if agent and agent.prompt:
            self.add_block(PersonaBlock(agent.prompt))

        # Extra: Formatting (Technically part of Meta/Tool but handled separately for now)
        self.add_block(FormatBlock(model_name))

        return self


class ImageModelPromptBuilder(BasePromptBuilder):
    """Builder for image generation models (Simplified)."""

    def construct_prompt(self, agent: Optional[Agent], model_name: str | None) -> "ImageModelPromptBuilder":
        if agent and agent.prompt:
            self.add_block(PersonaBlock(agent.prompt))

        return self


async def build_system_prompt(db: AsyncSession, agent: Optional[Agent], model_name: str | None) -> str:
    """
    Build system prompt for the agent using the modular builder.
    """
    if model_name and ("image" in model_name or "vision" in model_name or "dall-e" in model_name):
        builder = ImageModelPromptBuilder()
    else:
        builder = TextModelPromptBuilder()

    builder.construct_prompt(agent, model_name)

    return builder.build()
