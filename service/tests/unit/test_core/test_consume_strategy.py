"""Unit tests for consumption calculation strategies."""

import json

from app.core.consume.calculator import ConsumptionCalculator
from app.core.consume.strategy import (
    ConsumptionContext,
    TierBasedConsumptionStrategy,
)
from app.core.consume.pricing import TIER_MODEL_CONSUMPTION_RATE
from app.schemas.model_tier import ModelTier


class TestConsumptionContext:
    """Tests for ConsumptionContext dataclass."""

    def test_default_values(self) -> None:
        """Test that ConsumptionContext has expected defaults."""
        context = ConsumptionContext()
        assert context.model_tier is None
        assert context.input_tokens == 0
        assert context.output_tokens == 0
        assert context.total_tokens == 0
        assert context.content_length == 0
        assert context.tool_costs == 0

    def test_with_values(self) -> None:
        """Test ConsumptionContext with custom values."""
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            content_length=5000,
            tool_costs=15,
        )
        assert context.model_tier == ModelTier.PRO
        assert context.input_tokens == 1000
        assert context.output_tokens == 500
        assert context.total_tokens == 1500
        assert context.content_length == 5000
        assert context.tool_costs == 15


class TestTierBasedConsumptionStrategy:
    """Tests for TierBasedConsumptionStrategy."""

    def test_lite_tier_is_free(self) -> None:
        """Test that LITE tier results in zero cost."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.LITE,
            input_tokens=10000,
            output_tokens=5000,
            total_tokens=15000,
            content_length=50000,
        )
        result = strategy.calculate(context)

        assert result.amount == 0
        assert result.breakdown["tier_rate"] == 0.0
        assert result.breakdown["tier"] == "lite"
        assert "note" in result.breakdown

    def test_standard_tier_base_multiplier(self) -> None:
        """Test STANDARD tier with rate 1.0."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.STANDARD,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            content_length=1000,
        )
        result = strategy.calculate(context)

        # STANDARD rate is 1.0
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.STANDARD] == 1.0

        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)
        expected = int(expected_token_cost * 1.0)
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 1.0

    def test_pro_tier_multiplier(self) -> None:
        """Test PRO tier with rate 3.0."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            content_length=1000,
        )
        result = strategy.calculate(context)

        # PRO rate is 3.0
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.PRO] == 3.0

        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)
        expected = int(expected_token_cost * 3.0)
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 3.0

    def test_ultra_tier_multiplier(self) -> None:
        """Test ULTRA tier with rate 6.8."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.ULTRA,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            content_length=1000,
        )
        result = strategy.calculate(context)

        # ULTRA rate is 6.8
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.ULTRA] == 6.8

        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)
        expected = int(expected_token_cost * 6.8)
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 6.8

    def test_tool_costs(self) -> None:
        """Test that tool costs are included in calculation."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.STANDARD,
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            content_length=0,
            tool_costs=20,
        )
        result = strategy.calculate(context)

        # token_cost(0) * 1.0 + tool_costs(20) = 20
        assert result.amount == 20
        assert result.breakdown["tool_costs"] == 20

    def test_no_tier_defaults_to_1(self) -> None:
        """Test that None tier defaults to rate 1.0."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=None,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            content_length=1000,
        )
        result = strategy.calculate(context)

        # Should use default rate 1.0
        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)
        expected = int(expected_token_cost * 1.0)
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 1.0
        assert result.breakdown["tier"] == "default"

    def test_breakdown_contains_all_fields(self) -> None:
        """Test that breakdown contains all expected fields."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            content_length=1000,
            tool_costs=10,
        )
        result = strategy.calculate(context)

        assert "token_cost" in result.breakdown
        assert "tool_costs" in result.breakdown
        assert "tier_rate" in result.breakdown
        assert "tier" in result.breakdown
        assert "pre_multiplier_total" in result.breakdown


class TestConsumptionCalculator:
    """Tests for ConsumptionCalculator."""

    def test_calculate_lite_tier_is_free(self) -> None:
        """Test that LITE tier results in zero cost via calculator."""
        context = ConsumptionContext(
            model_tier=ModelTier.LITE,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
        )
        result = ConsumptionCalculator.calculate(context)

        assert result.amount == 0

    def test_calculate_pro_tier(self) -> None:
        """Test PRO tier calculation via calculator."""
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
        )
        result = ConsumptionCalculator.calculate(context)

        # PRO rate is 3.0
        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)
        expected = int(expected_token_cost * 3.0)
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 3.0

    def test_breakdown_is_json_serializable(self) -> None:
        """Test that breakdown can be serialized to JSON."""
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
        )
        result = ConsumptionCalculator.calculate(context)

        # Should not raise
        json_str = json.dumps(result.breakdown)
        assert json_str is not None
        assert len(json_str) > 0

        # Should be valid JSON
        parsed = json.loads(json_str)
        assert parsed == result.breakdown

    def test_set_custom_strategy(self) -> None:
        """Test that set_strategy delegates to the custom strategy."""
        from unittest.mock import MagicMock

        from app.core.consume.strategy import ConsumptionResult

        mock_strategy = MagicMock()
        mock_result = ConsumptionResult(amount=999, breakdown={"custom": True})
        mock_strategy.calculate.return_value = mock_result

        try:
            ConsumptionCalculator.set_strategy(mock_strategy)
            context = ConsumptionContext(model_tier=ModelTier.LITE)
            result = ConsumptionCalculator.calculate(context)

            mock_strategy.calculate.assert_called_once_with(context)
            assert result.amount == 999
            assert result.breakdown == {"custom": True}
        finally:
            ConsumptionCalculator.reset_strategy()

    def test_reset_strategy_restores_default(self) -> None:
        """Test that reset_strategy restores TierBasedConsumptionStrategy."""
        from unittest.mock import MagicMock

        mock_strategy = MagicMock()
        ConsumptionCalculator.set_strategy(mock_strategy)
        ConsumptionCalculator.reset_strategy()

        # After reset, LITE tier should be free (default behavior)
        context = ConsumptionContext(model_tier=ModelTier.LITE, input_tokens=1000)
        result = ConsumptionCalculator.calculate(context)
        assert result.amount == 0
