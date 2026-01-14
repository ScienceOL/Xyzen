"""Unit tests for consumption calculation strategies."""

import json

from app.core.consume_calculator import ConsumptionCalculator
from app.core.consume_strategy import (
    ConsumptionContext,
    TierBasedConsumptionStrategy,
)
from app.schemas.model_tier import TIER_MODEL_CONSUMPTION_RATE, ModelTier


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
        assert context.generated_files_count == 0

    def test_with_values(self) -> None:
        """Test ConsumptionContext with custom values."""
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            content_length=5000,
            generated_files_count=2,
        )
        assert context.model_tier == ModelTier.PRO
        assert context.input_tokens == 1000
        assert context.output_tokens == 500
        assert context.total_tokens == 1500
        assert context.content_length == 5000
        assert context.generated_files_count == 2


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
            generated_files_count=5,
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
            generated_files_count=0,
        )
        result = strategy.calculate(context)

        # STANDARD rate is 1.0
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.STANDARD] == 1.0

        # Calculate expected: base(3) + tokens(1000*0.2/1000 + 1000*1/1000) = 3 + 0.2 + 1 = 4.2
        # With multiplier 1.0 = int(4.2) = 4
        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)  # 0.2 + 1 = 1.2
        expected = int((3 + expected_token_cost) * 1.0)
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
            generated_files_count=0,
        )
        result = strategy.calculate(context)

        # PRO rate is 3.0
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.PRO] == 3.0

        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)  # 1.2
        expected = int((3 + expected_token_cost) * 3.0)  # 4.2 * 3 = 12.6 -> 12
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
            generated_files_count=0,
        )
        result = strategy.calculate(context)

        # ULTRA rate is 6.8
        assert TIER_MODEL_CONSUMPTION_RATE[ModelTier.ULTRA] == 6.8

        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)  # 1.2
        expected = int((3 + expected_token_cost) * 6.8)  # 4.2 * 6.8 = 28.56 -> 28
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 6.8

    def test_file_generation_cost(self) -> None:
        """Test that file generation cost is included."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=ModelTier.STANDARD,
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            content_length=0,
            generated_files_count=2,
        )
        result = strategy.calculate(context)

        # Base(3) + files(2*10) = 23, with rate 1.0 = 23
        expected = int((3 + 20) * 1.0)
        assert result.amount == expected
        assert result.breakdown["file_cost"] == 20

    def test_no_tier_defaults_to_1(self) -> None:
        """Test that None tier defaults to rate 1.0."""
        strategy = TierBasedConsumptionStrategy()
        context = ConsumptionContext(
            model_tier=None,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            content_length=1000,
            generated_files_count=0,
        )
        result = strategy.calculate(context)

        # Should use default rate 1.0
        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)  # 1.2
        expected = int((3 + expected_token_cost) * 1.0)  # 4
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
            generated_files_count=1,
        )
        result = strategy.calculate(context)

        assert "base_cost" in result.breakdown
        assert "token_cost" in result.breakdown
        assert "file_cost" in result.breakdown
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
            generated_files_count=0,
        )
        result = ConsumptionCalculator.calculate(context)

        # PRO rate is 3.0
        expected_token_cost = (1000 * 0.2 / 1000) + (1000 * 1 / 1000)  # 1.2
        expected = int((3 + expected_token_cost) * 3.0)  # 12
        assert result.amount == expected
        assert result.breakdown["tier_rate"] == 3.0

    def test_breakdown_is_json_serializable(self) -> None:
        """Test that breakdown can be serialized to JSON."""
        context = ConsumptionContext(
            model_tier=ModelTier.PRO,
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            generated_files_count=1,
        )
        result = ConsumptionCalculator.calculate(context)

        # Should not raise
        json_str = json.dumps(result.breakdown)
        assert json_str is not None
        assert len(json_str) > 0

        # Should be valid JSON
        parsed = json.loads(json_str)
        assert parsed == result.breakdown
