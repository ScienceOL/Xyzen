"""Model tier definitions for intelligent model selection.

Users select from 4 tiers instead of specific models. The backend
uses an LLM to intelligently select the best model for the task
from available candidates in the tier.
"""

from dataclasses import dataclass, field
from enum import Enum

from app.schemas.provider import ProviderType


class ModelTier(str, Enum):
    """User-facing model tiers for simplified selection."""

    ULTRA = "ultra"  # Complex reasoning, research tasks
    PRO = "pro"  # Production workloads
    STANDARD = "standard"  # General purpose, balanced
    LITE = "lite"  # Quick responses, simple tasks


@dataclass
class TierModelCandidate:
    """
    A model candidate for a tier.

    Extensible design for future selection strategies:
    - weight: For probability-based selection (higher = more likely)
    - priority: For priority-based selection (lower = higher priority)
    - capabilities: For capability-based matching
    - is_fallback: Always-available fallback option
    """

    model: str
    provider_type: ProviderType
    is_fallback: bool = False
    weight: float = 1.0  # For probability-based selection
    priority: int = 0  # Lower = higher priority (for ordered selection)
    capabilities: list[str] = field(default_factory=list)  # e.g., ["coding", "creative", "reasoning"]
    description: str = ""  # Human-readable description for LLM selection


# Model for intelligent selection (Gemini 2.5 Flash)
MODEL_SELECTOR_MODEL = "qwen3-next-80b-a3b-instruct"
MODEL_SELECTOR_PROVIDER = ProviderType.QWEN

# Model for topic title generation (fast, efficient model)
TOPIC_RENAME_MODEL = "qwen3-next-80b-a3b-instruct"
TOPIC_RENAME_PROVIDER = ProviderType.QWEN


# Tier-to-model candidates mapping
# Each tier has multiple candidates with a Gemini fallback
TIER_MODEL_CANDIDATES: dict[ModelTier, list[TierModelCandidate]] = {
    ModelTier.ULTRA: [
        TierModelCandidate(
            model="Vendor2/Claude-4.5-Opus",
            provider_type=ProviderType.GPUGEEK,
            is_fallback=True,
            priority=99,
            capabilities=["reasoning", "creative", "coding"],
            description="Best for coding and choose this for most tasks. Exceptional in complex coding, agentic tasks, and reasoning; highly reliable for software engineering.",
        ),
        # TierModelCandidate(
        #     model="gpt-5.2-pro",
        #     provider_type=ProviderType.AZURE_OPENAI,
        #     is_fallback=True,
        #     priority=99,
        #     capabilities=["coding", "analysis"],
        #     description="Only use this for really complex reasoning(<1%), never use this for normal tasks. Strong in agentic coding and deep reasoning.",
        # ),
    ],
    ModelTier.PRO: [
        TierModelCandidate(
            model="gemini-3-pro-preview",
            provider_type=ProviderType.GOOGLE_VERTEX,
            priority=1,
            description="Default choice (99%+). Best choice for most tasks.",
        ),
        # TierModelCandidate(
        #     model="gpt-5.2",
        #     provider_type=ProviderType.AZURE_OPENAI,
        #     priority=3,
        #     capabilities=["coding"],
        #     description="Just use this for pure code generate tasks, never, never use this for other tasks.",
        # ),
        TierModelCandidate(
            model="Vendor2/Claude-4.5-Sonnet",
            provider_type=ProviderType.GPUGEEK,
            is_fallback=True,
            priority=99,
            # capabilities=["reasoning", "creative", "coding"],
            description="Just use this for detail report generation tasks, such as business reports, market analysis or research papers, never use this for other tasks.",
        ),
    ],
    ModelTier.STANDARD: [
        TierModelCandidate(
            model="gemini-3-flash-preview",
            provider_type=ProviderType.GOOGLE_VERTEX,
            priority=1,
            capabilities=["general", "fast"],
            description="Choose this for most tasks. Fast and efficient for general and multimodal tasks, strong in handling large contexts and coding, with impressive speed for big tasks.",
        ),
        TierModelCandidate(
            model="qwen3-max",
            provider_type=ProviderType.QWEN,
            is_fallback=True,
            priority=99,
            capabilities=["coding", "multilingual"],
            description="Choose this if user uses Chinese. Impressive in programming, agent tasks, and multilingual support with high benchmark scores; strong for coding and math.",
        ),
        # TierModelCandidate(
        #     model="gpt-5-mini",
        #     provider_type=ProviderType.AZURE_OPENAI,
        #     is_fallback=True,
        #     priority=99,
        #     capabilities=["general"],
        #     description="Choose this if this is just a simple task. Fast and efficient for general tasks, strong in reasoning and multimodal capabilities, outperforming predecessors in speed and cost.",
        # ),
    ],
    ModelTier.LITE: [
        TierModelCandidate(
            model="DeepSeek/DeepSeek-V3.1-0821",
            provider_type=ProviderType.GPUGEEK,
            priority=4,
            capabilities=["coding", "efficient"],
            description="Choose this for most tasks. Efficient with strong performance in coding and reasoning, comparable to larger models; great for instruction following and agentic tasks.",
        ),
        TierModelCandidate(
            model="qwen3-30b-a3b",
            provider_type=ProviderType.QWEN,
            priority=1,
            capabilities=["fast", "efficient"],
            description="Choose this if user needs quick responses. Excellent for coding, reasoning, and multilingual tasks; outperforms in agentic scenarios and vision-related tasks.",
        ),
        TierModelCandidate(
            model="gemini-2.5-flash-lite",
            provider_type=ProviderType.GOOGLE_VERTEX,
            is_fallback=True,
            priority=99,
            capabilities=["fast", "efficient"],
            description="Choose this if this is just a simple task. Fast and lightweight for general tasks, suitable for high-throughput needs, but may underperform in complex reasoning.",
        ),
        TierModelCandidate(
            model="gpt-5-nano",
            provider_type=ProviderType.AZURE_OPENAI,
            priority=3,
            capabilities=["fast", "efficient"],
            description="Choose this if user needs reasoning. Fast for simple tasks and basic reasoning; cost-effective for quick responses, though less capable than newer models for complex queries.",
        ),
    ],
}

TIER_MODEL_CONSUMPTION_RATE: dict[ModelTier, float] = {
    ModelTier.ULTRA: 6.8,
    ModelTier.PRO: 3.0,
    ModelTier.STANDARD: 1.0,
    ModelTier.LITE: 0.0,
}


def get_fallback_model_for_tier(tier: ModelTier) -> TierModelCandidate:
    """Get the fallback model for a tier.

    Args:
        tier: The model tier

    Returns:
        The fallback TierModelCandidate for the tier
    """
    candidates = TIER_MODEL_CANDIDATES.get(tier, TIER_MODEL_CANDIDATES[ModelTier.STANDARD])
    for candidate in candidates:
        if candidate.is_fallback:
            return candidate
    # If no fallback defined, use last candidate
    return candidates[-1]


def resolve_model_for_tier(tier: ModelTier) -> str:
    """Resolve the default (fallback) model name for a given tier.

    This is a simple fallback that returns the tier's fallback model.
    For intelligent selection, use the model_selector service.

    Args:
        tier: The user-selected model tier

    Returns:
        The fallback model name for this tier
    """
    return get_fallback_model_for_tier(tier).model


def get_candidate_for_model(model_name: str) -> TierModelCandidate | None:
    """Get the candidate definition for a specific model name.

    Args:
        model_name: The model name to look up

    Returns:
        The TierModelCandidate if found, else None
    """
    for candidates in TIER_MODEL_CANDIDATES.values():
        for candidate in candidates:
            if candidate.model == model_name:
                return candidate
    return None
