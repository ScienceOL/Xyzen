"""Unified pricing configuration for credits, tool costs, and model costs.

Centralizes all pricing coefficients so changes only require editing this file.
"""

import logging

from app.schemas.model_tier import ModelTier

logger = logging.getLogger(__name__)

# Base credit cost per API call
BASE_COST: int = 1

# Tier multiplier → final credit amount
TIER_MODEL_CONSUMPTION_RATE: dict[ModelTier, float] = {
    ModelTier.ULTRA: 6.8,
    ModelTier.PRO: 3.0,
    ModelTier.STANDARD: 1.0,
    ModelTier.LITE: 0.0,
}

# Token -> credit base rates
TOKEN_CREDIT_RATES: dict[str, float] = {
    "input": 0.2 / 1000,  # credits per input token
    "output": 1.0 / 1000,  # credits per output token
}

# Tool call -> fixed credit cost (by tool name).
# Unlisted tools default to 0 via calculate_tool_cost().
TOOL_CREDIT_COSTS: dict[str, int] = {
    # --- Image ---
    "generate_image": 10,
    "read_image": 2,
    # --- Web / Search ---
    "web_search": 1,
    "web_fetch": 1,
    "literature_search": 1,
    # --- Knowledge ---
    "knowledge_write": 5,
    "knowledge_search": 1,
    "knowledge_list": 0,
    "knowledge_read": 0,
    "knowledge_help": 0,
    # --- Memory ---
    "manage_memory": 1,
    "search_memory": 1,
    # --- Sandbox ---
    "sandbox_bash": 1,
    "sandbox_upload": 1,
    "sandbox_export": 1,
    "sandbox_preview": 1,
    "sandbox_read": 0,
    "sandbox_write": 0,
    "sandbox_edit": 0,
    "sandbox_glob": 0,
    "sandbox_grep": 0,
    # --- Delegation / Subagent ---
    "spawn_subagent": 2,
    "delegate_to_agent": 2,
    "list_user_agents": 0,
    "get_agent_details": 0,
    # --- Skills ---
    "activate_skill": 0,
    "list_skill_resources": 0,
}

# Model -> real cost rates (USD per token, for platform cost tracking).
# Keys must match the model names in schemas/model_tier.py candidates.
MODEL_COST_RATES: dict[str, dict[str, float]] = {
    # --- Global: ULTRA ---
    "Vendor2/Claude-4.6-Opus": {"input": 5e-6, "output": 25e-6},
    # --- Global: PRO ---
    "gemini-3-pro-preview": {"input": 1.25e-6, "output": 10e-6},
    "Vendor2/Claude-4.5-Sonnet": {"input": 3e-6, "output": 15e-6},
    # --- Global: STANDARD ---
    "gemini-3-flash-preview": {"input": 0.15e-6, "output": 3.5e-6},
    "qwen3-30b-a3b": {"input": 0.15e-6, "output": 0.8e-6},
    # --- Global: LITE ---
    "gemini-2.5-flash-lite": {"input": 0.1e-6, "output": 0.4e-6},
    "DeepSeek/DeepSeek-V3.1-0821": {"input": 0.15e-6, "output": 0.75e-6},
    # --- China: ULTRA ---
    "kimi-k2.5": {"input": 0.6e-6, "output": 2.5e-6},
    # --- China: PRO ---
    "glm-4.7": {"input": 0.6e-6, "output": 2.2e-6},
    # --- China: STANDARD ---
    "qwen3-max": {"input": 1.2e-6, "output": 6e-6},
    # --- China: LITE ---
    "deepseek-v3.2": {"input": 0.15e-6, "output": 0.75e-6},
    # --- Helper (selector / topic_rename) ---
    "qwen3-next-80b-a3b-instruct": {"input": 0.15e-6, "output": 0.6e-6},
    # --- Image generation / vision models ---
    "gemini-3-pro-image-preview": {"input": 2e-6, "output": 2e-6},
    "qwen-image-max": {"input": 0, "output": 0},
    "qwen-image-edit-max": {"input": 0, "output": 0},
    "qwen-vl-max-latest": {"input": 1.6e-6, "output": 6.4e-6},
}


def calculate_tool_cost(tool_name: str) -> int:
    """Pure function: look up tool_name in TOOL_CREDIT_COSTS. Called at settlement."""
    cost = TOOL_CREDIT_COSTS.get(tool_name)
    if cost is None:
        logger.warning("Tool %r not in TOOL_CREDIT_COSTS, cost will be 0", tool_name)
        return 0
    return cost


CACHE_READ_DISCOUNT: float = 0.1  # cache_read tokens charged at 10% of input rate


def get_model_cost(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_input_tokens: int = 0,
) -> float:
    """Calculate real platform cost in USD for a model call."""
    rates = MODEL_COST_RATES.get(model_name)
    if not rates:
        logger.warning("Model %r not in MODEL_COST_RATES, cost will be 0", model_name)
        return 0.0
    regular_input = max(0, input_tokens - cache_read_input_tokens)
    return (
        regular_input * rates.get("input", 0)
        + cache_read_input_tokens * rates.get("input", 0) * CACHE_READ_DISCOUNT
        + output_tokens * rates.get("output", 0)
    )


def calculate_llm_credits(
    input_tokens: int,
    output_tokens: int,
    tier_rate: float,
    cache_read_input_tokens: int = 0,
) -> int:
    """Calculate credit consumption for one LLM call. LITE (rate=0) returns 0."""
    if tier_rate <= 0:
        return 0
    regular_input = max(0, input_tokens - cache_read_input_tokens)
    token_cost = (
        regular_input * TOKEN_CREDIT_RATES["input"]
        + cache_read_input_tokens * TOKEN_CREDIT_RATES["input"] * CACHE_READ_DISCOUNT
        + output_tokens * TOKEN_CREDIT_RATES["output"]
    )
    return int(token_cost * tier_rate)


def calculate_llm_cost_usd(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_input_tokens: int = 0,
) -> float:
    """Calculate real platform cost in USD for one LLM call. Semantic alias for get_model_cost."""
    return get_model_cost(model_name, input_tokens, output_tokens, cache_read_input_tokens)


def calculate_settlement_total(record_amounts_sum: int, tier_rate: float) -> int:
    """Calculate settlement total = BASE_COST + sum of record amounts. LITE returns 0."""
    if tier_rate <= 0:
        return 0
    return BASE_COST + record_amounts_sum


def validate_pricing_coverage() -> None:
    """Validate that all registered tools and configured models have pricing entries.

    Called at startup after tool registration to surface missing pricing config early.
    """

    # --- Tool pricing coverage ---
    from app.tools.registry import BuiltinToolRegistry

    registered_tools = set(BuiltinToolRegistry._metadata.keys())
    priced_tools = set(TOOL_CREDIT_COSTS.keys())

    for tool_id in sorted(registered_tools - priced_tools):
        logger.warning("Tool %r registered but missing from TOOL_CREDIT_COSTS (defaults to 0)", tool_id)
    for tool_id in sorted(priced_tools - registered_tools):
        logger.debug("Tool %r in TOOL_CREDIT_COSTS but not registered (may be deprecated)", tool_id)

    # --- Model pricing coverage ---
    all_models: set[str] = set()

    from app.schemas.model_tier import (
        _CHINA_TIER_MODEL_CANDIDATES,
        _GLOBAL_TIER_MODEL_CANDIDATES,
        _REGION_HELPER_MODELS,
    )

    for candidates_map in (_GLOBAL_TIER_MODEL_CANDIDATES, _CHINA_TIER_MODEL_CANDIDATES):
        for tier_candidates in candidates_map.values():
            for c in tier_candidates:
                all_models.add(c.model)

    for helpers in _REGION_HELPER_MODELS.values():
        for model_name, _ in helpers.values():
            all_models.add(model_name)

    from app.configs.image import ImageConfig, _REGION_IMAGE_OVERRIDES

    base = ImageConfig()
    for attr in ("Model", "EditModel", "VisionModel"):
        all_models.add(getattr(base, attr))
    for overrides in _REGION_IMAGE_OVERRIDES.values():
        for key in ("Model", "EditModel", "VisionModel"):
            if key in overrides:
                all_models.add(overrides[key])

    priced_models = set(MODEL_COST_RATES.keys())
    for m in sorted(all_models - priced_models):
        logger.warning("Model %r configured but missing from MODEL_COST_RATES (cost_usd=0)", m)
    for m in sorted(priced_models - all_models):
        logger.debug("Model %r in MODEL_COST_RATES but not in any config (may be deprecated)", m)

    logger.info(
        "Pricing coverage: %d tools (%d missing), %d models (%d missing)",
        len(registered_tools),
        len(registered_tools - priced_tools),
        len(all_models),
        len(all_models - priced_models),
    )
