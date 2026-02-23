"""Consumption tracking and billing package.

Re-exports public interfaces so that existing imports like
``from app.core.consume import settle_chat_records`` continue to work.
"""

# service.py
from app.core.consume.service import ConsumeService, settle_chat_records

# strategy.py
from app.core.consume.strategy import (
    ConsumptionContext,
    ConsumptionResult,
    ConsumptionStrategy,
    TierBasedConsumptionStrategy,
)

# calculator.py
from app.core.consume.calculator import ConsumptionCalculator

# tracking.py
from app.core.consume.tracking import (
    ConsumptionTrackingService,
    record_llm_usage_from_context,
    record_messages_usage_from_context,
    record_response_usage_from_context,
)

# context.py
from app.core.consume.context import (
    TrackingContext,
    clear_tracking_context,
    get_tracking_context,
    set_tracking_context,
)

# pricing.py
from app.core.consume.pricing import (
    MODEL_COST_RATES,
    TIER_MODEL_CONSUMPTION_RATE,
    TOKEN_CREDIT_RATES,
    TOOL_CREDIT_COSTS,
    calculate_llm_cost_usd,
    calculate_llm_credits,
    calculate_settlement_total,
    calculate_tool_cost,
    get_model_cost,
)

__all__ = [
    # service
    "ConsumeService",
    "settle_chat_records",
    # strategy
    "ConsumptionContext",
    "ConsumptionResult",
    "ConsumptionStrategy",
    "TierBasedConsumptionStrategy",
    # calculator
    "ConsumptionCalculator",
    # tracking
    "ConsumptionTrackingService",
    "record_llm_usage_from_context",
    "record_messages_usage_from_context",
    "record_response_usage_from_context",
    # context
    "TrackingContext",
    "get_tracking_context",
    "set_tracking_context",
    "clear_tracking_context",
    # pricing
    "MODEL_COST_RATES",
    "TIER_MODEL_CONSUMPTION_RATE",
    "TOKEN_CREDIT_RATES",
    "TOOL_CREDIT_COSTS",
    "calculate_llm_cost_usd",
    "calculate_llm_credits",
    "calculate_settlement_total",
    "calculate_tool_cost",
    "get_model_cost",
]
