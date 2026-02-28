"""Unified pricing configuration for credits, tool costs, and model costs.

Centralizes all pricing coefficients so changes only require editing this file.
Model cost rates are resolved at runtime from models.dev (via ModelsDevService)
with multi-layer caching (Redis + local + stale). Unknown models log a warning
and default to cost=0.
"""

import logging

from app.schemas.model_tier import ModelTier

logger = logging.getLogger(__name__)

# ================================================
# 定价策略 (Pricing Strategy)
# ================================================

# 模型层级倍率 → 最终积分计算
TIER_MODEL_CONSUMPTION_RATE: dict[ModelTier, float] = {
    ModelTier.ULTRA: 6.8,
    ModelTier.PRO: 3.0,
    ModelTier.STANDARD: 1.0,
    ModelTier.LITE: 0.0,
}

# Token → 积分基础费率
TOKEN_CREDIT_RATES: dict[str, float] = {
    "input": 0.2 / 1000,  # 每输入token的积分
    "output": 1.0 / 1000,  # 每输出token的积分
}

# 缓存读取折扣率：缓存读取的token按输入费率的10%计费
CACHE_READ_DISCOUNT: float = 0.1

# 模型兜底费率 (USD per token)：当 models.dev 查询失败时使用
# 费率来源：各厂商官方定价页（per 1M tokens），手动维护
FALLBACK_MODEL_COST_RATES: dict[str, dict[str, float]] = {
    # --- Anthropic (via GPUGeek) ---
    "Vendor2/Claude-4.6-Opus": {"input": 5.0e-6, "output": 25.0e-6},
    "Vendor2/Claude-4.5-Sonnet": {"input": 3.0e-6, "output": 15.0e-6},
    # --- Google Vertex ---
    "gemini-3.1-pro-preview": {"input": 2.0e-6, "output": 12.0e-6},
    "gemini-3-flash-preview": {"input": 0.5e-6, "output": 3.0e-6},
    # --- Qwen (Alibaba Cloud) ---
    "qwen3-30b-a3b": {"input": 0.15e-6, "output": 0.60e-6},
    "qwen3-max": {"input": 1.20e-6, "output": 6.0e-6},
    "qwen3-next-80b-a3b-instruct": {"input": 0.09e-6, "output": 1.10e-6},
    "deepseek-v3.2": {"input": 0.28e-6, "output": 0.42e-6},
    # --- China-region models (via Qwen gateway) ---
    "kimi-k2.5": {"input": 0.60e-6, "output": 3.0e-6},
    "glm-4.7": {"input": 0.54e-6, "output": 2.40e-6},
}

# 工具调用 → 固定积分成本（按工具名称）
# 未列出的工具默认成本为0（通过calculate_tool_cost()）
TOOL_CREDIT_COSTS: dict[str, int] = {
    # --- Web Search ---
    "web_search": 0,
    "web_fetch": 1,
    "literature_search": 1,
    # --- Knowledge ---
    "knowledge_write": 1,
    "knowledge_search": 0,
    "knowledge_list": 0,
    "knowledge_read": 0,
    "knowledge_help": 0,
    # --- Memory ---
    "manage_memory": 1,
    "search_memory": 1,
    # --- File I/O ---
    "file_read": 1,
    # --- Image ---
    "generate_image": 10,
    "read_image": 2,
    # --- Video ---
    "generate_video": 1000,
    # --- Sandbox ---
    "sandbox_bash": 5,
    "sandbox_upload": 0,
    "sandbox_export": 0,
    "sandbox_preview": 0,
    "sandbox_read": 0,
    "sandbox_write": 1,
    "sandbox_edit": 0,
    "sandbox_glob": 0,
    "sandbox_grep": 0,
    # --- Skills ---
    "activate_skill": 0,
    "list_skill_resources": 0,
    # --- Delegation / Subagent ---
    "spawn_subagent": 1,
    "delegate_to_agent": 1,
    "list_user_agents": 0,
    "get_agent_details": 0,
    # --- Scheduled Tasks ---
    "create_scheduled_task": 1,
    "list_scheduled_tasks": 0,
    "cancel_scheduled_task": 0,
}


# ================================================
# Token积分计算 (Token Credit Calculation)
# ================================================


def calculate_llm_credits(
    input_tokens: int,
    output_tokens: int,
    tier_rate: float,
    cache_read_input_tokens: int = 0,
) -> int:
    """计算一次LLM调用的积分消耗。LITE (rate=0) 返回0。"""
    if tier_rate <= 0:
        return 0
    regular_input = max(0, input_tokens - cache_read_input_tokens)
    token_cost = (
        regular_input * TOKEN_CREDIT_RATES["input"]
        + cache_read_input_tokens * TOKEN_CREDIT_RATES["input"] * CACHE_READ_DISCOUNT
        + output_tokens * TOKEN_CREDIT_RATES["output"]
    )
    return int(token_cost * tier_rate)


# ================================================
# 工具积分计算 (Tool Credit Calculation)
# ================================================


def calculate_tool_cost(tool_name: str) -> int:
    """纯函数：在TOOL_CREDIT_COSTS中查找tool_name。在结算时调用。"""
    cost = TOOL_CREDIT_COSTS.get(tool_name)
    if cost is None:
        logger.warning("Tool %r not in TOOL_CREDIT_COSTS, cost will be 0", tool_name)
        return 0
    return cost


# ================================================
# Cost计算 (Cost Calculation)
# ================================================


async def _resolve_cost_rates(
    model_name: str,
    provider: str | None = None,
) -> dict[str, float] | None:
    """尝试从models.dev解析每token费率。

    返回 {"input": <per-token>, "output": <per-token>} 或 None。
    """
    try:
        from app.core.model_registry.service import (
            GPUGEEK_TO_MODELSDEV,
            INTERNAL_TO_MODELSDEV,
            ModelsDevService,
        )

        # 解析models.dev (provider_id, model_id) 对
        modelsdev_provider: str | None = None
        modelsdev_model_id: str = model_name

        # GPUGeek模型需要显式映射
        gpugeek_mapping = GPUGEEK_TO_MODELSDEV.get(model_name)
        if gpugeek_mapping:
            modelsdev_provider, modelsdev_model_id = gpugeek_mapping
        elif provider:
            modelsdev_provider = INTERNAL_TO_MODELSDEV.get(provider)

        info = await ModelsDevService.get_model_info_for_key(modelsdev_model_id, modelsdev_provider)
        if info and (info.input_cost_per_token > 0 or info.output_cost_per_token > 0):
            return {"input": info.input_cost_per_token, "output": info.output_cost_per_token}
    except Exception:
        logger.debug("models.dev lookup failed for %r", model_name, exc_info=True)

    return None


def _compute_cost(
    rates: dict[str, float],
    input_tokens: int,
    output_tokens: int,
    cache_read_input_tokens: int = 0,
) -> float:
    """纯算术：应用每token费率并考虑缓存读取折扣。"""
    regular_input = max(0, input_tokens - cache_read_input_tokens)
    return (
        regular_input * rates.get("input", 0)
        + cache_read_input_tokens * rates.get("input", 0) * CACHE_READ_DISCOUNT
        + output_tokens * rates.get("output", 0)
    )


async def get_model_cost(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_input_tokens: int = 0,
    *,
    provider: str | None = None,
) -> float:
    """计算模型调用的实际平台成本（USD）。

    运行时从models.dev解析每token费率（缓存）。
    当models.dev没有给定模型的数据时，返回0。
    """
    rates = await _resolve_cost_rates(model_name, provider)
    if not rates:
        rates = FALLBACK_MODEL_COST_RATES.get(model_name)
        if rates:
            logger.warning("Model %r not found in models.dev, using fallback rates", model_name)
        else:
            logger.warning(
                "Model %r not found in models.dev or fallback table, cost will be 0",
                model_name,
            )
            return 0.0
    return _compute_cost(rates, input_tokens, output_tokens, cache_read_input_tokens)


async def calculate_llm_cost_usd(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_input_tokens: int = 0,
    *,
    provider: str | None = None,
) -> float:
    """计算一次LLM调用的实际平台成本（USD）。get_model_cost的语义别名。"""
    return await get_model_cost(model_name, input_tokens, output_tokens, cache_read_input_tokens, provider=provider)


# ================================================
# 工具定价校验 (Tool Pricing Validation)
# ================================================


def validate_pricing_coverage() -> None:
    """在工具注册后启动时调用，以尽早发现缺失的定价配置。"""

    # --- 工具定价覆盖 ---
    from app.tools.registry import BuiltinToolRegistry

    registered_tools = {info.id for info in BuiltinToolRegistry.list_all()}
    priced_tools = set(TOOL_CREDIT_COSTS.keys())

    for tool_id in sorted(registered_tools - priced_tools):
        logger.warning("Tool %r registered but missing from TOOL_CREDIT_COSTS (defaults to 0)", tool_id)
    for tool_id in sorted(priced_tools - registered_tools):
        logger.debug("Tool %r in TOOL_CREDIT_COSTS but not registered (may be deprecated)", tool_id)

    logger.info(
        "Pricing coverage: %d tools (%d missing)",
        len(registered_tools),
        len(registered_tools - priced_tools),
    )


async def validate_model_pricing_coverage() -> None:
    """启动时校验所有配置模型的费率覆盖，失败则阻塞启动。"""
    from app.schemas.model_tier import REGION_HELPER_MODELS, REGION_TIER_CANDIDATES

    # Collect unique (model_name, provider) pairs across all regions
    models_to_check: set[tuple[str, str]] = set()

    for _region, tier_dict in REGION_TIER_CANDIDATES.items():
        for _tier, candidates in tier_dict.items():
            for candidate in candidates:
                models_to_check.add((candidate.model, str(candidate.provider_type)))

    for _region, helpers in REGION_HELPER_MODELS.items():
        for _role, (model_name, provider_type) in helpers.items():
            models_to_check.add((model_name, str(provider_type)))

    failed: list[str] = []
    for model_name, provider in sorted(models_to_check):
        rates = await _resolve_cost_rates(model_name, provider)
        if rates:
            logger.debug("Model pricing OK: %s (provider=%s)", model_name, provider)
        elif FALLBACK_MODEL_COST_RATES.get(model_name):
            logger.warning(
                "Model pricing FALLBACK: %s (provider=%s) — not in models.dev, using fallback rates",
                model_name,
                provider,
            )
        else:
            logger.error("Model pricing MISSING: %s (provider=%s)", model_name, provider)
            failed.append(f"{model_name} (provider={provider})")

    if failed:
        raise RuntimeError(
            f"Model pricing coverage check failed for {len(failed)} model(s):\n"
            + "\n".join(f"  - {m}" for m in failed)
            + "\n\nFix: add mappings in GPUGEEK_TO_MODELSDEV / INTERNAL_TO_MODELSDEV, "
            "verify models.dev has pricing data, or add to FALLBACK_MODEL_COST_RATES."
        )

    logger.info(
        "Model pricing coverage validated: all %d models have cost data",
        len(models_to_check),
    )
