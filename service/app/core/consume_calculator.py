"""Consumption calculator with strategy pattern.

This module provides a factory/manager for consumption calculation strategies,
allowing easy switching between different pricing approaches.
"""

from app.core.consume_strategy import (
    ConsumptionContext,
    ConsumptionResult,
    ConsumptionStrategy,
    TierBasedConsumptionStrategy,
)


class ConsumptionCalculator:
    """Factory and executor for consumption strategies.

    This class manages strategy instances and provides a unified interface
    for calculating consumption amounts.

    Usage:
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
        )
        result = ConsumptionCalculator.calculate(context)
        print(f"Amount: {result.amount}, Breakdown: {result.breakdown}")
    """

    _strategy: ConsumptionStrategy = TierBasedConsumptionStrategy()

    @classmethod
    def calculate(cls, context: ConsumptionContext) -> ConsumptionResult:
        """Calculate consumption amount using tier-based strategy.

        Args:
            context: ConsumptionContext with all relevant information

        Returns:
            ConsumptionResult with amount and breakdown
        """
        return cls._strategy.calculate(context)

    @classmethod
    def set_strategy(cls, strategy: ConsumptionStrategy) -> None:
        """Set the consumption strategy.

        Useful for testing or runtime extension.

        Args:
            strategy: Strategy instance to use
        """
        cls._strategy = strategy

    @classmethod
    def reset_strategy(cls) -> None:
        """Reset to default tier-based strategy."""
        cls._strategy = TierBasedConsumptionStrategy()
