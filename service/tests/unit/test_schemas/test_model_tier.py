"""Unit tests for model tier resolution."""

from app.schemas.model_tier import (
    TIER_MODEL_CANDIDATES,
    ModelTier,
    get_fallback_model_for_tier,
    resolve_model_for_tier,
)


class TestModelTier:
    """Test ModelTier enum and resolution."""

    def test_model_tier_values(self) -> None:
        """Test that ModelTier has expected values."""
        assert ModelTier.ULTRA.value == "ultra"
        assert ModelTier.PRO.value == "pro"
        assert ModelTier.STANDARD.value == "standard"
        assert ModelTier.LITE.value == "lite"

    def test_resolve_model_for_tier_ultra(self) -> None:
        """Test ULTRA tier returns expected fallback model."""
        model = resolve_model_for_tier(ModelTier.ULTRA)
        fallback = get_fallback_model_for_tier(ModelTier.ULTRA)
        assert model == fallback.model
        assert model is not None
        assert len(model) > 0

    def test_resolve_model_for_tier_pro(self) -> None:
        """Test PRO tier returns expected fallback model."""
        model = resolve_model_for_tier(ModelTier.PRO)
        fallback = get_fallback_model_for_tier(ModelTier.PRO)
        assert model == fallback.model
        assert model is not None
        assert len(model) > 0

    def test_resolve_model_for_tier_standard(self) -> None:
        """Test STANDARD tier returns expected fallback model."""
        model = resolve_model_for_tier(ModelTier.STANDARD)
        fallback = get_fallback_model_for_tier(ModelTier.STANDARD)
        assert model == fallback.model
        assert model is not None
        assert len(model) > 0

    def test_resolve_model_for_tier_lite(self) -> None:
        """Test LITE tier returns expected fallback model."""
        model = resolve_model_for_tier(ModelTier.LITE)
        fallback = get_fallback_model_for_tier(ModelTier.LITE)
        assert model == fallback.model
        assert model is not None
        assert len(model) > 0

    def test_all_tiers_have_mapping(self) -> None:
        """Test that all tiers have a model mapping."""
        for tier in ModelTier:
            assert tier in TIER_MODEL_CANDIDATES
            model = resolve_model_for_tier(tier)
            assert model is not None
            assert len(model) > 0

    def test_all_tiers_have_candidates(self) -> None:
        """Test that all tiers have at least one candidate."""
        for tier in ModelTier:
            candidates = TIER_MODEL_CANDIDATES[tier]
            assert len(candidates) > 0
            # Each tier should have at least one candidate
            assert all(c.model for c in candidates)
            assert all(c.provider_type for c in candidates)

    def test_all_tiers_have_fallback(self) -> None:
        """Test that all tiers have a fallback model."""
        for tier in ModelTier:
            fallback = get_fallback_model_for_tier(tier)
            assert fallback is not None
            assert fallback.model is not None
            assert len(fallback.model) > 0
            assert fallback.provider_type is not None

    def test_fallback_models_are_marked(self) -> None:
        """Test that fallback models have is_fallback=True."""
        for tier in ModelTier:
            candidates = TIER_MODEL_CANDIDATES[tier]
            fallback_candidates = [c for c in candidates if c.is_fallback]
            # Each tier should have at least one fallback
            assert len(fallback_candidates) >= 1
            # Fallback should be retrievable
            fallback = get_fallback_model_for_tier(tier)
            assert fallback.is_fallback is True

    def test_candidate_priorities(self) -> None:
        """Test that candidates have valid priorities."""
        for tier in ModelTier:
            candidates = TIER_MODEL_CANDIDATES[tier]
            for candidate in candidates:
                # Priority should be non-negative
                assert candidate.priority >= 0
                # Fallback should have high priority number (low priority)
                if candidate.is_fallback:
                    assert candidate.priority >= 90
