"""Consumption tracking and billing package.

Re-exports public interfaces so that existing imports like
``from app.core.consume import settle_chat_records`` continue to work.
"""

# consume_service.py (merged from former service.py + tracking.py)
from app.core.consume.consume_service import (
    ConsumeService,
    ConsumptionTrackingService,
    TrackingContext,
    clear_tracking_context,
    get_tracking_context,
    record_llm_usage_from_context,
    record_messages_usage_from_context,
    record_response_usage_from_context,
    set_tracking_context,
    settle_chat_records,
)

# developer_reward.py
from app.core.consume.developer_reward import DeveloperRewardService, REWARD_RATES

# pricing.py
from app.core.consume.pricing import (
    TIER_MODEL_CONSUMPTION_RATE,
    TOKEN_CREDIT_RATES,
    TOOL_CREDIT_COSTS,
    calculate_llm_cost_usd,
    calculate_llm_credits,
    calculate_tool_cost,
    get_model_cost,
)

__all__ = [
    # consume_service
    "ConsumeService",
    "settle_chat_records",
    # developer_reward
    "DeveloperRewardService",
    "REWARD_RATES",
    # consume_service (tracking)
    "ConsumptionTrackingService",
    "TrackingContext",
    "clear_tracking_context",
    "get_tracking_context",
    "record_llm_usage_from_context",
    "record_messages_usage_from_context",
    "record_response_usage_from_context",
    "set_tracking_context",
    # pricing
    "TIER_MODEL_CONSUMPTION_RATE",
    "TOKEN_CREDIT_RATES",
    "TOOL_CREDIT_COSTS",
    "calculate_llm_cost_usd",
    "calculate_llm_credits",
    "calculate_tool_cost",
    "get_model_cost",
]
