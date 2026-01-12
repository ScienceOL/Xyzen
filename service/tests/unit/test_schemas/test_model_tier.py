"""Unit tests for model tier resolution."""

from app.schemas.model_tier import TIER_MODEL_MAP, ModelTier, resolve_model_for_tier


class TestModelTier:
    """Test ModelTier enum and resolution."""

    def test_model_tier_values(self) -> None:
        """Test that ModelTier has expected values."""
        assert ModelTier.DEEP.value == "deep"
        assert ModelTier.PROD.value == "prod"
        assert ModelTier.STANDARD.value == "standard"
        assert ModelTier.FAST.value == "fast"

    def test_resolve_model_for_tier_deep(self) -> None:
        """Test DEEP tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.DEEP)
        assert model == TIER_MODEL_MAP[ModelTier.DEEP]
        assert "gemini-2.5-pro" in model or "claude" in model or "gpt" in model

    def test_resolve_model_for_tier_prod(self) -> None:
        """Test PROD tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.PROD)
        assert model == TIER_MODEL_MAP[ModelTier.PROD]

    def test_resolve_model_for_tier_standard(self) -> None:
        """Test STANDARD tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.STANDARD)
        assert model == TIER_MODEL_MAP[ModelTier.STANDARD]

    def test_resolve_model_for_tier_fast(self) -> None:
        """Test FAST tier returns expected model."""
        model = resolve_model_for_tier(ModelTier.FAST)
        assert model == TIER_MODEL_MAP[ModelTier.FAST]

    def test_all_tiers_have_mapping(self) -> None:
        """Test that all tiers have a model mapping."""
        for tier in ModelTier:
            assert tier in TIER_MODEL_MAP
            model = resolve_model_for_tier(tier)
            assert model is not None
            assert len(model) > 0
