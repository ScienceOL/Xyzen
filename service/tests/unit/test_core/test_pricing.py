"""Unit tests for app.core.consume.pricing module."""

from unittest.mock import AsyncMock, patch

import pytest

from app.core.consume.pricing import (
    CACHE_READ_DISCOUNT,
    FALLBACK_MODEL_COST_RATES,
    TOKEN_CREDIT_RATES,
    _compute_cost,
    calculate_llm_cost_usd,
    calculate_llm_credits,
    calculate_tool_cost,
    get_model_cost,
    validate_model_pricing_coverage,
)


class TestCalculateToolCost:
    def test_web_search(self) -> None:
        assert calculate_tool_cost("web_search") == 0

    def test_generate_image(self) -> None:
        assert calculate_tool_cost("generate_image") == 10

    def test_knowledge_write(self) -> None:
        assert calculate_tool_cost("knowledge_write") == 1

    def test_read_image(self) -> None:
        assert calculate_tool_cost("read_image") == 2

    def test_unknown_tool_returns_zero(self) -> None:
        assert calculate_tool_cost("unknown_tool") == 0

    def test_empty_string_returns_zero(self) -> None:
        assert calculate_tool_cost("") == 0


class TestComputeCost:
    """Test the pure _compute_cost helper (no async, no lookup)."""

    def test_basic(self) -> None:
        rates = {"input": 1e-6, "output": 2e-6}
        assert _compute_cost(rates, 1000, 500) == 1000 * 1e-6 + 500 * 2e-6

    def test_cache_read_discount(self) -> None:
        rates = {"input": 1e-6, "output": 2e-6}
        cost = _compute_cost(rates, 1000, 500, cache_read_input_tokens=400)
        expected = 600 * 1e-6 + 400 * 1e-6 * CACHE_READ_DISCOUNT + 500 * 2e-6
        assert cost == pytest.approx(expected)

    def test_cache_read_exceeds_input_clamps_to_zero(self) -> None:
        rates = {"input": 1e-6, "output": 2e-6}
        cost = _compute_cost(rates, 100, 500, cache_read_input_tokens=200)
        assert cost >= 0


# Patch target: the lazy import inside _resolve_cost_rates
_RESOLVE_PATCH = "app.core.consume.pricing._resolve_cost_rates"


class TestGetModelCost:
    """Tests for async get_model_cost with models.dev resolution."""

    @pytest.mark.asyncio
    async def test_uses_modelsdev_rates(self) -> None:
        """When models.dev returns rates, they are used."""
        modelsdev_rates = {"input": 2e-6, "output": 8e-6}
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=modelsdev_rates):
            cost = await get_model_cost("some-new-model", input_tokens=1000, output_tokens=500)
        expected = _compute_cost(modelsdev_rates, 1000, 500)
        assert cost == pytest.approx(expected)

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_rates(self) -> None:
        """When models.dev returns None, cost is 0."""
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None):
            cost = await get_model_cost("gemini-3-pro-preview", input_tokens=1000, output_tokens=500)
        assert cost == 0.0

    @pytest.mark.asyncio
    async def test_unknown_model_returns_zero(self) -> None:
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None):
            assert await get_model_cost("unknown-model", input_tokens=1000, output_tokens=500) == 0.0

    @pytest.mark.asyncio
    async def test_zero_tokens(self) -> None:
        rates = {"input": 1.25e-6, "output": 10e-6}
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=rates):
            assert await get_model_cost("gemini-3-pro-preview", input_tokens=0, output_tokens=0) == 0.0

    @pytest.mark.asyncio
    async def test_cache_read_discount(self) -> None:
        rates = {"input": 1.25e-6, "output": 10e-6}
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=rates):
            cost = await get_model_cost(
                "gemini-3-pro-preview",
                input_tokens=1000,
                output_tokens=500,
                cache_read_input_tokens=400,
            )
        expected = _compute_cost(rates, 1000, 500, cache_read_input_tokens=400)
        assert cost == pytest.approx(expected)

    @pytest.mark.asyncio
    async def test_provider_passed_through(self) -> None:
        """Verify provider kwarg is forwarded to _resolve_cost_rates."""
        mock_resolve = AsyncMock(return_value={"input": 1e-6, "output": 2e-6})
        with patch(_RESOLVE_PATCH, mock_resolve):
            await get_model_cost("model-x", 100, 50, provider="google_vertex")
        mock_resolve.assert_awaited_once_with("model-x", "google_vertex")

    @pytest.mark.asyncio
    async def test_uses_fallback_when_modelsdev_missing(self) -> None:
        """When models.dev returns None but fallback has rates, use fallback."""
        fallback_model = next(iter(FALLBACK_MODEL_COST_RATES))
        fallback_rates = FALLBACK_MODEL_COST_RATES[fallback_model]
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None):
            cost = await get_model_cost(fallback_model, input_tokens=1000, output_tokens=500)
        expected = _compute_cost(fallback_rates, 1000, 500)
        assert cost == pytest.approx(expected)
        assert cost > 0.0


class TestCalculateLlmCredits:
    def test_pro_tier(self) -> None:
        # 1000 input + 500 output, tier_rate=3.0
        # token_cost = 1000*0.0002 + 500*0.001 = 0.2 + 0.5 = 0.7
        # amount = int(0.7 * 3.0) = int(2.1) = 2
        assert calculate_llm_credits(1000, 500, 3.0) == 2

    def test_standard_tier(self) -> None:
        # 2000 input + 800 output, tier_rate=1.0
        # token_cost = 2000*0.0002 + 800*0.001 = 0.4 + 0.8 = 1.2
        # amount = int(1.2 * 1.0) = 1
        assert calculate_llm_credits(2000, 800, 1.0) == 1

    def test_lite_tier_returns_zero(self) -> None:
        assert calculate_llm_credits(1000, 500, 0.0) == 0

    def test_negative_rate_returns_zero(self) -> None:
        assert calculate_llm_credits(1000, 500, -1.0) == 0

    def test_zero_tokens(self) -> None:
        assert calculate_llm_credits(0, 0, 3.0) == 0

    def test_ultra_tier(self) -> None:
        # 1000 input + 500 output, tier_rate=6.8
        token_cost = 1000 * TOKEN_CREDIT_RATES["input"] + 500 * TOKEN_CREDIT_RATES["output"]
        expected = int(token_cost * 6.8)
        assert calculate_llm_credits(1000, 500, 6.8) == expected

    def test_cache_read_discount(self) -> None:
        # 1000 input (400 cache_read) + 500 output, tier_rate=3.0
        # regular_input = 600, cache_read = 400
        # token_cost = 600*0.0002 + 400*0.0002*0.1 + 500*0.001
        #            = 0.12 + 0.008 + 0.5 = 0.628
        # amount = int(0.628 * 3.0) = int(1.884) = 1
        assert calculate_llm_credits(1000, 500, 3.0, cache_read_input_tokens=400) == 1

    def test_cache_read_reduces_cost(self) -> None:
        # Verify that cache_read tokens result in lower cost than full price
        full_price = calculate_llm_credits(1000, 500, 3.0)
        discounted = calculate_llm_credits(1000, 500, 3.0, cache_read_input_tokens=800)
        assert discounted < full_price

    def test_cache_read_exceeds_input_clamps_to_zero(self) -> None:
        """Provider bug: cache_read > input should not produce negative cost."""
        assert calculate_llm_credits(100, 500, 3.0, cache_read_input_tokens=200) >= 0


class TestCalculateLlmCostUsd:
    @pytest.mark.asyncio
    async def test_delegates_to_get_model_cost(self) -> None:
        rates = {"input": 1.25e-6, "output": 10e-6}
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=rates):
            cost = await calculate_llm_cost_usd("gemini-3-pro-preview", 1000, 500)
            expected = await get_model_cost("gemini-3-pro-preview", 1000, 500)
        assert cost == expected

    @pytest.mark.asyncio
    async def test_unknown_model(self) -> None:
        with patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None):
            assert await calculate_llm_cost_usd("unknown", 1000, 500) == 0.0


# Patch targets for model pricing coverage tests
_TIER_CANDIDATES_PATCH = "app.schemas.model_tier.REGION_TIER_CANDIDATES"
_HELPER_MODELS_PATCH = "app.schemas.model_tier.REGION_HELPER_MODELS"


def _make_candidate(model: str, provider_type: str) -> object:
    """Create a minimal TierModelCandidate-like object for testing."""
    from types import SimpleNamespace

    return SimpleNamespace(model=model, provider_type=provider_type)


_FALLBACK_PATCH = "app.core.consume.pricing.FALLBACK_MODEL_COST_RATES"


class TestValidateModelPricingCoverage:
    """Tests for validate_model_pricing_coverage startup check."""

    @pytest.mark.asyncio
    async def test_passes_when_all_models_resolve(self) -> None:
        """No error when every model resolves rates successfully."""
        candidates = {
            "global": {"ULTRA": [_make_candidate("model-a", "openai")]},
        }
        helpers: dict[str, dict[str, tuple[str, str]]] = {}
        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value={"input": 1e-6, "output": 2e-6}),
        ):
            await validate_model_pricing_coverage()  # should not raise

    @pytest.mark.asyncio
    async def test_raises_when_model_unresolvable(self) -> None:
        """RuntimeError raised when a model cannot be resolved from either source."""
        candidates = {
            "global": {"ULTRA": [_make_candidate("bad-model", "openai")]},
        }
        helpers: dict[str, dict[str, tuple[str, str]]] = {}
        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None),
            patch(_FALLBACK_PATCH, {}),
        ):
            with pytest.raises(RuntimeError, match="bad-model"):
                await validate_model_pricing_coverage()

    @pytest.mark.asyncio
    async def test_passes_with_fallback_when_modelsdev_missing(self) -> None:
        """No error when models.dev returns None but fallback table has rates."""
        candidates = {
            "global": {"ULTRA": [_make_candidate("fallback-model", "openai")]},
        }
        helpers: dict[str, dict[str, tuple[str, str]]] = {}
        fallback = {"fallback-model": {"input": 1e-6, "output": 2e-6}}
        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None),
            patch(_FALLBACK_PATCH, fallback),
        ):
            await validate_model_pricing_coverage()  # should not raise

    @pytest.mark.asyncio
    async def test_raises_only_when_both_missing(self) -> None:
        """RuntimeError raised only for models missing from both sources."""
        candidates = {
            "global": {
                "ULTRA": [
                    _make_candidate("has-fallback", "openai"),
                    _make_candidate("no-fallback", "openai"),
                ],
            },
        }
        helpers: dict[str, dict[str, tuple[str, str]]] = {}
        fallback = {"has-fallback": {"input": 1e-6, "output": 2e-6}}
        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, new_callable=AsyncMock, return_value=None),
            patch(_FALLBACK_PATCH, fallback),
        ):
            with pytest.raises(RuntimeError, match="no-fallback"):
                await validate_model_pricing_coverage()

    @pytest.mark.asyncio
    async def test_checks_all_regions(self) -> None:
        """Models from both global and zh-cn regions are checked."""
        candidates = {
            "global": {"ULTRA": [_make_candidate("global-model", "openai")]},
            "zh-cn": {"STANDARD": [_make_candidate("china-model", "qwen")]},
        }
        helpers: dict[str, dict[str, tuple[str, str]]] = {}
        resolved_calls: list[tuple[str, str | None]] = []

        async def _track_resolve(model: str, provider: str | None = None) -> dict[str, float]:
            resolved_calls.append((model, provider))
            return {"input": 1e-6, "output": 2e-6}

        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, side_effect=_track_resolve),
        ):
            await validate_model_pricing_coverage()

        checked_models = {call[0] for call in resolved_calls}
        assert "global-model" in checked_models
        assert "china-model" in checked_models

    @pytest.mark.asyncio
    async def test_checks_helper_models(self) -> None:
        """Helper models (selector, topic_rename) are included in the check."""
        candidates: dict[str, dict[str, list[object]]] = {"global": {}}
        helpers = {
            "global": {
                "selector": ("helper-selector", "qwen"),
                "topic_rename": ("helper-rename", "qwen"),
            },
        }
        resolved_calls: list[tuple[str, str | None]] = []

        async def _track_resolve(model: str, provider: str | None = None) -> dict[str, float]:
            resolved_calls.append((model, provider))
            return {"input": 1e-6, "output": 2e-6}

        with (
            patch(_TIER_CANDIDATES_PATCH, candidates),
            patch(_HELPER_MODELS_PATCH, helpers),
            patch(_RESOLVE_PATCH, side_effect=_track_resolve),
        ):
            await validate_model_pricing_coverage()

        checked_models = {call[0] for call in resolved_calls}
        assert "helper-selector" in checked_models
        assert "helper-rename" in checked_models
