"""Unit tests for model tier resolution."""

import pytest

from app.schemas.model_tier import (
    ModelTier,
    get_fallback_model_for_tier,
    get_tier_candidates,
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
        candidates_map = get_tier_candidates()
        for tier in ModelTier:
            assert tier in candidates_map
            model = resolve_model_for_tier(tier)
            assert model is not None
            assert len(model) > 0

    def test_all_tiers_have_candidates(self) -> None:
        """Test that all tiers have at least one candidate."""
        candidates_map = get_tier_candidates()
        for tier in ModelTier:
            candidates = candidates_map[tier]
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
        candidates_map = get_tier_candidates()
        for tier in ModelTier:
            candidates = candidates_map[tier]
            fallback_candidates = [c for c in candidates if c.is_fallback]
            # Each tier should have at least one fallback
            assert len(fallback_candidates) >= 1
            # Fallback should be retrievable
            fallback = get_fallback_model_for_tier(tier)
            assert fallback.is_fallback is True

    def test_candidate_priorities(self) -> None:
        """Test that candidates have valid priorities."""
        candidates_map = get_tier_candidates()
        for tier in ModelTier:
            candidates = candidates_map[tier]
            for candidate in candidates:
                # Priority should be non-negative
                assert candidate.priority >= 0
                # Fallback should have high priority number (low priority)
                if candidate.is_fallback:
                    assert candidate.priority >= 90


class TestRegionCandidates:
    """Test region-based model candidate selection."""

    def test_china_region_has_all_tiers(self, monkeypatch: "pytest.MonkeyPatch") -> None:
        """Test that china region has valid candidates for all tiers."""
        from app.configs import configs

        monkeypatch.setattr(configs, "Region", "zh-CN")
        candidates_map = get_tier_candidates()
        for tier in ModelTier:
            assert tier in candidates_map
            assert len(candidates_map[tier]) > 0

    def test_china_region_has_fallbacks(self, monkeypatch: "pytest.MonkeyPatch") -> None:
        """Test that china region has fallback models for all tiers."""
        from app.configs import configs

        monkeypatch.setattr(configs, "Region", "zh-CN")
        for tier in ModelTier:
            fallback = get_fallback_model_for_tier(tier)
            assert fallback is not None
            assert fallback.is_fallback is True

    def test_unknown_region_falls_back_to_global(self, monkeypatch: "pytest.MonkeyPatch") -> None:
        """Test that unknown region falls back to global candidates."""
        from app.configs import configs

        monkeypatch.setattr(configs, "Region", "unknown")
        candidates_map = get_tier_candidates()
        # Should return global candidates
        for tier in ModelTier:
            assert tier in candidates_map
            assert len(candidates_map[tier]) > 0

    def test_region_is_case_insensitive(self, monkeypatch: "pytest.MonkeyPatch") -> None:
        """Test that region matching is case-insensitive."""
        from app.configs import configs

        monkeypatch.setattr(configs, "Region", "Zh-cN")
        candidates_map = get_tier_candidates()
        # Should still return China candidates
        for tier in ModelTier:
            assert tier in candidates_map
            assert len(candidates_map[tier]) == 1  # China has exactly 1 candidate per tier
