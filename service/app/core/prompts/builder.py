"""
Prompt Builder for constructing system prompts from blocks.

Uses a modular builder pattern with configurable blocks driven by PromptConfig.
Supports backward compatibility with legacy agent.prompt field.
"""

from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import StrEnum
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


class PromptLayerKind(StrEnum):
    """Kind of prompt layer in the multi-SystemMessage structure."""

    PLATFORM = "platform"
    AGENT = "agent"
    CORE_MEMORY = "core_memory"
    AUTO_MEMORY = "auto_memory"


@dataclass(frozen=True)
class PromptLayer:
    """A single prompt layer with a kind tag and content string."""

    kind: PromptLayerKind
    content: str


@dataclass(frozen=True)
class SystemPromptLayers:
    """Collection of prompt layers with provenance metadata.

    Separates static (PLATFORM, AGENT) from dynamic (CORE_MEMORY, AUTO_MEMORY)
    content to enable future prompt caching.
    """

    layers: list[PromptLayer]
    provenance: dict[str, Any]

    def non_empty_layers(self) -> list[PromptLayer]:
        """Return only layers with non-empty content."""
        return [layer for layer in self.layers if layer.content.strip()]

    def to_flat_string(self) -> str:
        """Join all non-empty layer contents into a single string (backward compat)."""
        parts = [layer.content.strip() for layer in self.layers if layer.content.strip()]
        return "\n\n".join(parts)


@dataclass(frozen=True)
class MemoryContext:
    """Pre-fetched memory data for prompt injection.

    Must be populated before prompt building since blocks are synchronous.
    """

    core_memory_text: str = ""
    core_memory_empty: bool = True
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
) -> list[PromptLayer]:
    """Build prompt layers for the multi-SystemMessage structure.

    Returns a list of PromptLayer objects:
    - PLATFORM: MetaInstruction + Context + ToolInstruction + SkillMetadata + Format
    - AGENT: PersonaBlock (custom instructions)
    - CORE_MEMORY: Core memory profile (changes occasionally)
    - AUTO_MEMORY: Auto-retrieved memories (changes every turn)

    Image models only return a single AGENT layer.
    """
    agent_content = PersonaBlock(config).build().strip()

    if _is_image_model(model_name):
        return [PromptLayer(PromptLayerKind.AGENT, agent_content)]

    _mem = memory_ctx or MemoryContext()

    # PLATFORM layer: static platform policy + tools + formatting
    platform_parts = [
        MetaInstructionBlock(config).build(),
        ContextBlock(config).build(),
        ToolInstructionBlock(config, agent).build(),
        SkillMetadataBlock(skills or []).build(),
        FormatBlock(config, model_name).build(),
    ]
    platform_content = _join_non_empty(platform_parts)

    # Memory layers (separated from platform for cacheability)
    core_memory_content = (
        CoreMemoryPromptBlock(
            _mem.core_memory_text,
            is_empty=_mem.core_memory_empty,
        )
        .build()
        .strip()
    )
    auto_memory_content = AutoRetrievedMemoriesBlock(_mem.auto_retrieved).build().strip()

    return [
        PromptLayer(PromptLayerKind.PLATFORM, platform_content),
        PromptLayer(PromptLayerKind.AGENT, agent_content),
        PromptLayer(PromptLayerKind.CORE_MEMORY, core_memory_content),
        PromptLayer(PromptLayerKind.AUTO_MEMORY, auto_memory_content),
    ]


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


async def build_system_prompt_layers(
    db: AsyncSession,
    agent: Agent | None,
    model_name: str | None,
    memory_ctx: MemoryContext | None = None,
) -> SystemPromptLayers:
    """Build system prompt as layered structure for multi-SystemMessage injection.

    Returns SystemPromptLayers with separate PLATFORM, AGENT, CORE_MEMORY,
    and AUTO_MEMORY layers. Empty layers are preserved but can be filtered
    via non_empty_layers().

    Args:
        db: Database session (for skill metadata loading)
        agent: Agent configuration (may be None)
        model_name: Model name for format customization
        memory_ctx: Pre-fetched memory data (Core Memory + auto-retrieved)

    Returns:
        SystemPromptLayers with layer list and provenance summary
    """
    graph_config = agent.graph_config if agent else None
    agent_prompt = agent.prompt if agent else None
    prompt_config = get_prompt_config_from_graph_config(graph_config, agent_prompt)

    skills: list[SkillMetadata] = []
    if agent and agent.id:
        skills = await _load_skill_metadata(db, agent.id)

    layers = _build_prompt_layers(prompt_config, agent, model_name, skills=skills, memory_ctx=memory_ctx)
    flat_prompt = _join_non_empty([layer.content for layer in layers if layer.content.strip()])

    # Extract platform/agent content for provenance
    platform_prompt = ""
    agent_prompt_layer = ""
    for layer in layers:
        if layer.kind == PromptLayerKind.PLATFORM:
            platform_prompt = layer.content
        elif layer.kind == PromptLayerKind.AGENT:
            agent_prompt_layer = layer.content

    provenance = _build_prompt_provenance(
        graph_config=graph_config,
        agent_prompt=agent_prompt,
        platform_prompt=platform_prompt,
        agent_prompt_layer=agent_prompt_layer,
        final_prompt=flat_prompt,
        model_name=model_name,
        memory_ctx=memory_ctx,
    )
    return SystemPromptLayers(layers=layers, provenance=provenance)


async def build_system_prompt_with_provenance(
    db: AsyncSession,
    agent: Agent | None,
    model_name: str | None,
    memory_ctx: MemoryContext | None = None,
) -> SystemPromptBuildResult:
    """
    Build system prompt for the agent using the modular builder.

    Facade over build_system_prompt_layers() that returns a flat string
    for backward compatibility.

    Args:
        db: Database session (for skill metadata loading)
        agent: Agent configuration (may be None)
        model_name: Model name for format customization
        memory_ctx: Pre-fetched memory data (Core Memory + auto-retrieved)

    Returns:
        SystemPromptBuildResult with prompt text and provenance summary
    """
    prompt_layers = await build_system_prompt_layers(db, agent, model_name, memory_ctx=memory_ctx)
    return SystemPromptBuildResult(
        prompt=prompt_layers.to_flat_string(),
        provenance=prompt_layers.provenance,
    )


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
    core_empty = True

    # Layer A: Core Memory
    if configs.Memory.CoreMemory.Enabled:
        try:
            block = await svc.get_core_memory(user_id)
            core_empty = block.is_empty()
            core_text = block.to_prompt_text()
        except Exception:
            logger.debug("Core memory fetch failed for user %s", user_id, exc_info=True)

    # Layer B: Auto-retrieval (needs message_text for semantic search)
    if configs.Memory.AutoRetrieval.Enabled and message_text:
        try:
            retrieved = await svc.auto_retrieve_memories(user_id, message_text)
        except Exception:
            logger.debug("Auto-retrieval failed for user %s", user_id, exc_info=True)

    return MemoryContext(core_memory_text=core_text, core_memory_empty=core_empty, auto_retrieved=retrieved)
