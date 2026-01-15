"""Consumption calculation strategies.

This module defines the strategy pattern for consumption calculation,
allowing extensible and configurable pricing strategies.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.schemas.model_tier import TIER_MODEL_CONSUMPTION_RATE, ModelTier


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
    generated_files_count: int = 0


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
    - Tier rate multiplies ALL costs (base + tokens + files)
    """

    BASE_COST = 1
    INPUT_TOKEN_RATE = 0.2 / 1000  # per token
    OUTPUT_TOKEN_RATE = 1 / 1000  # per token
    FILE_GENERATION_COST = 10

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
                    "base_cost": 0,
                    "token_cost": 0,
                    "file_cost": 0,
                    "tier_rate": 0.0,
                    "tier": context.model_tier.value if context.model_tier else "lite",
                    "note": "LITE tier - free usage",
                },
            )

        # Calculate base token cost
        token_cost = context.input_tokens * self.INPUT_TOKEN_RATE + context.output_tokens * self.OUTPUT_TOKEN_RATE
        file_cost = context.generated_files_count * self.FILE_GENERATION_COST

        # Tier rate multiplies ALL costs
        base_amount = self.BASE_COST + token_cost + file_cost
        final_amount = int(base_amount * tier_rate)

        return ConsumptionResult(
            amount=final_amount,
            breakdown={
                "base_cost": self.BASE_COST,
                "token_cost": token_cost,
                "file_cost": file_cost,
                "pre_multiplier_total": base_amount,
                "tier_rate": tier_rate,
                "tier": context.model_tier.value if context.model_tier else "default",
            },
        )
