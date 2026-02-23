"""Consumption calculation strategies.

This module defines the strategy pattern for consumption calculation,
allowing extensible and configurable pricing strategies.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core.consume.pricing import (
    TIER_MODEL_CONSUMPTION_RATE,
    TOKEN_CREDIT_RATES,
)
from app.schemas.model_tier import ModelTier


@dataclass
class ConsumptionContext:
    """Context for consumption calculation.

    This dataclass holds all information needed to calculate consumption.
    Extensible: add more fields as pricing needs evolve.
    """

    model_tier: ModelTier | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    content_length: int = 0
    tool_costs: int = 0


@dataclass
class ConsumptionResult:
    """Result of consumption calculation.

    Attributes:
        amount: Final consumption amount (integer points)
        breakdown: Detailed breakdown of calculation for transparency/debugging
    """

    amount: int
    breakdown: dict[str, Any] = field(default_factory=dict)


class ConsumptionStrategy(ABC):
    """Abstract base for consumption calculation strategies.

    Implement this interface to create new pricing strategies.
    """

    @abstractmethod
    def calculate(self, context: ConsumptionContext) -> ConsumptionResult:
        """Calculate consumption amount based on context.

        Args:
            context: ConsumptionContext with all relevant information

        Returns:
            ConsumptionResult with amount and breakdown
        """
        pass


class TierBasedConsumptionStrategy(ConsumptionStrategy):
    """Calculate consumption using tier multipliers.

    Design decisions:
    - LITE tier (rate 0.0) = completely free
    - Tier rate multiplies base + token costs; tool costs are added as fixed credits
    """

    def calculate(self, context: ConsumptionContext) -> ConsumptionResult:
        """Calculate consumption with tier-based multiplier.

        Args:
            context: ConsumptionContext with tier and usage information

        Returns:
            ConsumptionResult with tier-adjusted amount
        """
        tier_rate = TIER_MODEL_CONSUMPTION_RATE.get(context.model_tier, 1.0) if context.model_tier else 1.0

        # LITE tier (rate 0.0) = completely free
        if tier_rate == 0.0:
            return ConsumptionResult(
                amount=0,
                breakdown={
                    "token_cost": 0,
                    "tool_costs": 0,
                    "tier_rate": 0.0,
                    "tier": context.model_tier.value if context.model_tier else "lite",
                    "note": "LITE tier - free usage",
                },
            )

        # Calculate base token cost
        token_cost = (
            context.input_tokens * TOKEN_CREDIT_RATES["input"] + context.output_tokens * TOKEN_CREDIT_RATES["output"]
        )

        # Tier rate multiplies token costs only.
        # Tool costs are added as fixed credits AFTER the multiplier —
        # they are tier-independent (e.g. generate_image costs 10 credits
        # regardless of whether the user is on ULTRA or STANDARD).
        base_amount = token_cost
        final_amount = int(base_amount * tier_rate) + context.tool_costs

        return ConsumptionResult(
            amount=final_amount,
            breakdown={
                "token_cost": token_cost,
                "tool_costs": context.tool_costs,
                "pre_multiplier_total": base_amount,
                "tier_rate": tier_rate,
                "tier": context.model_tier.value if context.model_tier else "default",
            },
        )
