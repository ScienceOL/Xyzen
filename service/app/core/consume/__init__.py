"""Consumption tracking and billing package.

Re-exports public interfaces so that existing imports like
``from app.core.consume import create_consume_for_chat`` continue to work.
"""

# service.py (was core/consume.py)
from app.core.consume.service import ConsumeService, create_consume_for_chat

# strategy.py (was core/consume_strategy.py)
from app.core.consume.strategy import (
    ConsumptionContext,
    ConsumptionResult,
    ConsumptionStrategy,
    TierBasedConsumptionStrategy,
)

# calculator.py (was core/consume_calculator.py)
from app.core.consume.calculator import ConsumptionCalculator

# New modules
from app.core.consume.tracking import (
    ConsumptionTrackingService,
    record_llm_usage_from_context,
    record_messages_usage_from_context,
    record_response_usage_from_context,
)
from app.core.consume.context import (
    TrackingContext,
    clear_tracking_context,
    get_tracking_context,
    set_tracking_context,
)
from app.core.consume.pricing import (
    BASE_COST,
    MODEL_COST_RATES,
    TIER_MODEL_CONSUMPTION_RATE,
    TOKEN_CREDIT_RATES,
    TOOL_CREDIT_COSTS,
    calculate_tool_cost,
    get_model_cost,
)

__all__ = [
    # service
    "ConsumeService",
    "create_consume_for_chat",
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
    "BASE_COST",
    "MODEL_COST_RATES",
    "TIER_MODEL_CONSUMPTION_RATE",
    "TOKEN_CREDIT_RATES",
    "TOOL_CREDIT_COSTS",
    "calculate_tool_cost",
    "get_model_cost",
]
