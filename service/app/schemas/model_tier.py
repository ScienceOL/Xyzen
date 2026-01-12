"""Model tier definitions for simplified model selection.

Users select from 4 tiers instead of specific models. The backend
resolves the appropriate model based on the tier.
"""

from enum import Enum


class ModelTier(str, Enum):
    """User-facing model tiers for simplified selection."""

    ULTRA = "ultra"  # Complex reasoning, research tasks
    PRO = "pro"  # Production workloads
    STANDARD = "standard"  # General purpose, balanced
    LITE = "lite"  # Quick responses, simple tasks


# MVP: Simple tier-to-model mapping
# Can be extended to config file or DB later for more flexibility
TIER_MODEL_MAP: dict[ModelTier, str] = {
    ModelTier.ULTRA: "gemini-3-pro-preview",
    ModelTier.PRO: "gemini-3-flash-preview",
    ModelTier.STANDARD: "gemini-2.5-flash-preview",
    ModelTier.LITE: "gemini-2.5-flash-lite",
}


def resolve_model_for_tier(tier: ModelTier) -> str:
    """Resolve the model name for a given tier.

    Args:
        tier: The user-selected model tier

    Returns:
        The model name to use for this tier
    """
    return TIER_MODEL_MAP.get(tier, TIER_MODEL_MAP[ModelTier.STANDARD])
