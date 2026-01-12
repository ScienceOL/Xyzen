"""Unit tests for model tier resolution."""

from app.schemas.model_tier import TIER_MODEL_MAP, ModelTier, resolve_model_for_tier


class TestModelTier:
    """Test ModelTier enum and resolution."""

    def test_model_tier_values(self) -> None:
        """Test that ModelTier has expected values."""
        assert ModelTier.ULTRA.value == "ultra"
        assert ModelTier.PRO.value == "pro"
        assert ModelTier.STANDARD.value == "standard"
        assert ModelTier.LITE.value == "lite"

    def test_resolve_model_for_tier_ultra(self) -> None:
        """Test ULTRA tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.ULTRA)
        assert model == TIER_MODEL_MAP[ModelTier.ULTRA]

    def test_resolve_model_for_tier_pro(self) -> None:
        """Test PRO tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.PRO)
        assert model == TIER_MODEL_MAP[ModelTier.PRO]

    def test_resolve_model_for_tier_standard(self) -> None:
        """Test STANDARD tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.STANDARD)
        assert model == TIER_MODEL_MAP[ModelTier.STANDARD]

    def test_resolve_model_for_tier_lite(self) -> None:
        """Test LITE tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.LITE)
        assert model == TIER_MODEL_MAP[ModelTier.LITE]

    def test_all_tiers_have_mapping(self) -> None:
        """Test that all tiers have a model mapping."""
        for tier in ModelTier:
            assert tier in TIER_MODEL_MAP
            model = resolve_model_for_tier(tier)
            assert model is not None
            assert len(model) > 0
