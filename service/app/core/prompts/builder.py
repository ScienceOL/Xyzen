"""
Prompt Builder for constructing system prompts from blocks.

Uses a modular builder pattern with configurable blocks driven by PromptConfig.
Supports backward compatibility with legacy agent.prompt field.
"""

from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import logging
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.prompts.blocks import (
    AutoRetrievedMemoriesBlock,
    ContextBlock,
    CoreMemoryPromptBlock,
    FormatBlock,
    MetaInstructionBlock,
    PersonaBlock,
    PromptBlock,
    SkillMetadata,
    SkillMetadataBlock,
    ToolInstructionBlock,
)
from app.core.prompts.defaults import get_prompt_config_from_graph_config
from app.models.agent import Agent
from app.schemas.prompt_config import PromptConfig

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SystemPromptBuildResult:
    """Built prompt text and non-sensitive provenance metadata."""

    prompt: str
    provenance: dict[str, Any]


@dataclass(frozen=True)
class MemoryContext:
    """Pre-fetched memory data for prompt injection.

    Must be populated before prompt building since blocks are synchronous.
    """

    core_memory_text: str = ""
    auto_retrieved: list[str] = field(default_factory=list)


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


def _build_prompt_layers(
    config: PromptConfig,
    agent: Agent | None,
    model_name: str | None,
    skills: list[SkillMetadata] | None = None,
    memory_ctx: MemoryContext | None = None,
) -> tuple[str, str]:
    """Build platform and agent prompt layers independently."""

    agent_layer = PersonaBlock(config).build().strip()

    if _is_image_model(model_name):
        return "", agent_layer

    _mem = memory_ctx or MemoryContext()
    platform_parts = [
        MetaInstructionBlock(config).build(),
        ContextBlock(config).build(),
        # Memory Layer A: Core Memory (always-in-context user profile)
        CoreMemoryPromptBlock(_mem.core_memory_text).build(),
        # Memory Layer B: Auto-retrieved relevant memories
        AutoRetrievedMemoriesBlock(_mem.auto_retrieved).build(),
        ToolInstructionBlock(config, agent).build(),
        SkillMetadataBlock(skills or []).build(),
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
    memory_ctx: MemoryContext | None = None,
) -> dict[str, Any]:
    prompt_config_raw: Any = graph_config.get("prompt_config", {}) if graph_config else {}
    custom_instructions: str | None = None
    if isinstance(prompt_config_raw, dict):
        raw_custom = prompt_config_raw.get("custom_instructions")
        if isinstance(raw_custom, str):
            custom_instructions = raw_custom
    has_graph_custom = bool(custom_instructions and custom_instructions.strip())

    _mem = memory_ctx or MemoryContext()
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
        "has_core_memory": bool(_mem.core_memory_text),
        "auto_retrieved_count": len(_mem.auto_retrieved),
    }


async def build_system_prompt_with_provenance(
    db: AsyncSession,
    agent: Agent | None,
    model_name: str | None,
    memory_ctx: MemoryContext | None = None,
) -> SystemPromptBuildResult:
    """
    Build system prompt for the agent using the modular builder.

    Extracts PromptConfig from agent's graph_config with fallbacks:
    1. graph_config.prompt_config (if present)
    2. Default PromptConfig (if no config)
    3. Backward compat: agent.prompt → custom_instructions

    Args:
        db: Database session (for skill metadata loading)
        agent: Agent configuration (may be None)
        model_name: Model name for format customization
        memory_ctx: Pre-fetched memory data (Core Memory + auto-retrieved)

    Returns:
        SystemPromptBuildResult with prompt text and provenance summary
    """
    # Extract prompt config from graph_config (with backward compatibility)
    graph_config = agent.graph_config if agent else None
    agent_prompt = agent.prompt if agent else None
    prompt_config = get_prompt_config_from_graph_config(graph_config, agent_prompt)

    # Load skill metadata for prompt injection
    skills: list[SkillMetadata] = []
    if agent and agent.id:
        skills = await _load_skill_metadata(db, agent.id)

    platform_prompt, resolved_agent_prompt = _build_prompt_layers(
        prompt_config, agent, model_name, skills=skills, memory_ctx=memory_ctx
    )
    final_prompt = _join_non_empty([platform_prompt, resolved_agent_prompt])

    provenance = _build_prompt_provenance(
        graph_config=graph_config,
        agent_prompt=agent_prompt,
        platform_prompt=platform_prompt,
        agent_prompt_layer=resolved_agent_prompt,
        final_prompt=final_prompt,
        model_name=model_name,
        memory_ctx=memory_ctx,
    )
    return SystemPromptBuildResult(prompt=final_prompt, provenance=provenance)


async def _load_skill_metadata(db: AsyncSession, agent_id: UUID) -> list[SkillMetadata]:
    """Load lightweight skill metadata for prompt injection."""
    try:
        from app.repos.skill import SkillRepository

        repo = SkillRepository(db)
        skills = await repo.get_skills_for_agent(agent_id)
        return [SkillMetadata(name=s.name, description=s.description) for s in skills]
    except Exception:
        logger.debug("Failed to load skill metadata for agent %s", agent_id, exc_info=True)
        return []


async def build_system_prompt(db: AsyncSession, agent: Agent | None, model_name: str | None) -> str:
    """Build complete system prompt string (compat facade)."""

    result = await build_system_prompt_with_provenance(db, agent, model_name)
    return result.prompt


async def fetch_memory_context(
    user_id: str | None,
    message_text: str | None = None,
) -> MemoryContext:
    """Fetch memory data for prompt injection. Fails gracefully.

    Retrieves Core Memory (Layer A) and runs semantic auto-retrieval (Layer B).
    Returns empty MemoryContext on any failure — chat must never break.
    """
    if not user_id:
        return MemoryContext()

    from app.configs import configs
    from app.core.memory.service import get_or_initialize_memory_service

    if not configs.Memory.Enabled:
        return MemoryContext()

    svc = await get_or_initialize_memory_service()
    if not svc or not svc.store:
        return MemoryContext()

    core_text = ""
    retrieved: list[str] = []

    # Layer A: Core Memory
    if configs.Memory.CoreMemory.Enabled:
        try:
            block = await svc.get_core_memory(user_id)
            core_text = block.to_prompt_text()
        except Exception:
            logger.debug("Core memory fetch failed for user %s", user_id, exc_info=True)

    # Layer B: Auto-retrieval (needs message_text for semantic search)
    if configs.Memory.AutoRetrieval.Enabled and message_text:
        try:
            retrieved = await svc.auto_retrieve_memories(user_id, message_text)
        except Exception:
            logger.debug("Auto-retrieval failed for user %s", user_id, exc_info=True)

    return MemoryContext(core_memory_text=core_text, auto_retrieved=retrieved)
