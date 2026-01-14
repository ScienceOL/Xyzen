"""Intelligent model selection for tier-based model routing.

This module uses a small LLM (Gemini 2.5 Flash) to analyze the user's first message
and select the optimal model from the available candidates in their chosen tier.
"""

import logging
from typing import TYPE_CHECKING

from langchain_core.messages import HumanMessage

from app.schemas.model_tier import (
    MODEL_SELECTOR_MODEL,
    MODEL_SELECTOR_PROVIDER,
    TIER_MODEL_CANDIDATES,
    ModelTier,
    TierModelCandidate,
    get_fallback_model_for_tier,
)
from app.schemas.provider import ProviderType

if TYPE_CHECKING:
    from app.core.providers.manager import ProviderManager

logger = logging.getLogger(__name__)


# Editable prompt template for model selection
MODEL_SELECTION_PROMPT = """You are a model router. Select the best model for the user's task.

Available models:
{available_models}

User's task:
{user_message}

Instructions:
- Pick the model that best matches the task requirements
- If the task needs image generation, pick an image-capable model
- You MUST select one model from the list above
- Return ONLY the exact model ID (e.g., "gemini-3-pro-preview"), nothing else"""


def _get_available_provider_types(user_provider_manager: "ProviderManager") -> set[ProviderType]:
    """Get the set of available provider types from the provider manager.

    Args:
        user_provider_manager: The user's provider manager

    Returns:
        Set of available ProviderType values
    """
    providers = user_provider_manager.list_providers()
    available_types = {cfg.provider_type for cfg in providers}
    logger.info(f"Available provider types: {[t.value for t in available_types]}")
    return available_types


def _filter_candidates_by_availability(
    tier: ModelTier,
    available_types: set[ProviderType],
) -> tuple[list[TierModelCandidate], TierModelCandidate | None]:
    """Filter tier candidates to only those with available providers.

    Args:
        tier: The model tier
        available_types: Set of available provider types

    Returns:
        Tuple of (available_candidates, fallback_candidate)
    """
    candidates = TIER_MODEL_CANDIDATES.get(tier, TIER_MODEL_CANDIDATES[ModelTier.STANDARD])
    available_candidates: list[TierModelCandidate] = []
    fallback: TierModelCandidate | None = None

    for candidate in candidates:
        logger.debug(
            f"Checking candidate {candidate.model}: provider={candidate.provider_type.value}, "
            f"in_available={candidate.provider_type in available_types}, is_fallback={candidate.is_fallback}"
        )
        if candidate.provider_type in available_types:
            if candidate.is_fallback:
                fallback = candidate
            else:
                available_candidates.append(candidate)

    # Sort by priority (lower = higher priority)
    available_candidates.sort(key=lambda c: c.priority)

    logger.info(
        f"Tier {tier.value}: {len(available_candidates)} available candidates, "
        f"fallback={'available' if fallback else 'not available'}"
    )
    for c in available_candidates:
        logger.info(f"  - {c.model} (priority={c.priority}, provider={c.provider_type.value})")

    return available_candidates, fallback


def _format_available_models_for_prompt(candidates: list[TierModelCandidate]) -> str:
    """Format available models for the LLM prompt.

    Args:
        candidates: List of available model candidates

    Returns:
        Formatted string for the prompt
    """
    lines = []
    for c in candidates:
        lines.append(f"- {c.model}: {c.description}")
    return "\n".join(lines)


async def select_model_for_tier(
    tier: ModelTier,
    first_message: str,
    user_provider_manager: "ProviderManager",
) -> str:
    """
    Intelligently select a model for the given tier based on the first message.

    Uses Gemini 2.5 Flash to analyze the task and select the optimal model.
    Falls back to the tier's fallback model if selection fails.

    Args:
        tier: The user-selected model tier
        first_message: The user's first message in the session
        user_provider_manager: The user's provider manager

    Returns:
        The selected model name
    """
    logger.info(f"Starting model selection for tier: {tier.value}")
    logger.debug(f"First message: {first_message[:200]}...")

    # Get available providers
    available_types = _get_available_provider_types(user_provider_manager)

    # Filter candidates by availability
    available_candidates, fallback = _filter_candidates_by_availability(tier, available_types)

    # If no candidates available, use fallback
    if not available_candidates:
        if fallback:
            logger.warning(f"No candidates available for tier {tier.value}, using fallback: {fallback.model}")
            return fallback.model
        else:
            fallback_candidate = get_fallback_model_for_tier(tier)
            logger.warning(
                f"No candidates or fallback available for tier {tier.value}, "
                f"using tier fallback: {fallback_candidate.model}"
            )
            return fallback_candidate.model

    # If only one candidate, use it directly (skip LLM call)
    if len(available_candidates) == 1:
        selected = available_candidates[0].model
        logger.info(f"Only one candidate available, selecting: {selected}")
        return selected

    # Check if selector model provider is available
    if MODEL_SELECTOR_PROVIDER not in available_types:
        # Use highest priority candidate
        selected = available_candidates[0].model
        logger.warning(
            f"Model selector provider ({MODEL_SELECTOR_PROVIDER.value}) not available, "
            f"using highest priority: {selected}"
        )
        return selected

    # Use LLM to select model
    try:
        selected = await _llm_select_model(
            available_candidates,
            first_message,
            user_provider_manager,
        )
        logger.info(f"LLM selected model: {selected}")
        return selected
    except Exception as e:
        logger.error(f"LLM model selection failed: {e}")
        # Fall back to highest priority candidate
        selected = (
            available_candidates[0].model
            if available_candidates
            else fallback.model
            if fallback
            else get_fallback_model_for_tier(tier).model
        )
        logger.warning(f"Falling back to: {selected}")
        return selected


async def _llm_select_model(
    candidates: list[TierModelCandidate],
    first_message: str,
    user_provider_manager: "ProviderManager",
) -> str:
    """Use LLM to select the best model from candidates.

    Args:
        candidates: Available model candidates
        first_message: User's first message
        user_provider_manager: Provider manager for LLM access

    Returns:
        Selected model name

    Raises:
        Exception: If LLM call fails or returns invalid selection
    """
    # Format prompt
    available_models_str = _format_available_models_for_prompt(candidates)
    logger.info(f"Available models: {available_models_str}")
    prompt = MODEL_SELECTION_PROMPT.format(
        available_models=available_models_str,
        user_message=first_message[:2000],  # Truncate long messages
    )

    logger.debug(f"Model selection prompt:\n{prompt}")

    # Create LLM and call
    llm = await user_provider_manager.create_langchain_model(
        provider_id=MODEL_SELECTOR_PROVIDER,
        model=MODEL_SELECTOR_MODEL,
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    logger.debug(f"LLM response: {response}")

    # Parse response
    if isinstance(response.content, str):
        selected_model = response.content.strip()

        # Validate selection
        valid_models = {c.model for c in candidates}
        if selected_model in valid_models:
            return selected_model
        else:
            logger.warning(f"LLM selected invalid model: {selected_model}, valid: {valid_models}")
            raise ValueError(f"Invalid model selection: {selected_model}")
    else:
        raise ValueError(f"Unexpected response type: {type(response.content)}")
