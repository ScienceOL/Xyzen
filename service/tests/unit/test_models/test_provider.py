"""Tests for Provider model."""

import pytest

from app.models.provider import ProviderCreate, ProviderUpdate
from app.schemas.provider import ProviderScope, ProviderType


class TestProviderModel:
    """Test Provider SQLModel."""

    def test_provider_create_defaults(self) -> None:
        """Test default values are set correctly."""
        # Minimal creation
        provider = ProviderCreate(
            name="Test Provider",
            provider_type=ProviderType.OPENAI,
            scope=ProviderScope.USER,
            key="sk-test",
            api="https://api.openai.com",
        )

        # Verify defaults
        assert provider.max_tokens == 4096
        assert provider.temperature == 0.7
        assert provider.timeout == 120
        assert provider.model is None
        assert provider.provider_config is None

    @pytest.mark.parametrize("scope", [ProviderScope.SYSTEM, ProviderScope.USER])
    def test_provider_scope_enum(self, scope: ProviderScope) -> None:
        """Test valid enum values for scope."""
        provider = ProviderCreate(
            name="Scoped Provider",
            provider_type=ProviderType.OPENAI,
            scope=scope,
            key="sk-test",
            api="https://api.test.com",
        )
        assert provider.scope == scope
        assert provider.is_system == (scope == ProviderScope.SYSTEM)

    @pytest.mark.parametrize(
        "provider_type",
        [ProviderType.OPENAI, ProviderType.AZURE_OPENAI, ProviderType.GOOGLE, ProviderType.GOOGLE_VERTEX],
    )
    def test_provider_type_enum(self, provider_type: ProviderType) -> None:
        """Test valid enum values for provider_type."""
        provider = ProviderCreate(
            name="Typed Provider",
            provider_type=provider_type,
            scope=ProviderScope.USER,
            key="sk-test",
            api="https://api.test.com",
        )
        assert provider.provider_type == provider_type

    def test_json_config_handling(self) -> None:
        """Test JSON field handling (provider_config)."""
        config = {"organization": "org-123", "deployment": "dep-456"}
        provider = ProviderCreate(
            name="Config Provider",
            provider_type=ProviderType.AZURE_OPENAI,
            scope=ProviderScope.USER,
            key="sk-test",
            api="https://azure.com",
            provider_config=config,
        )
        assert provider.provider_config is not None
        assert provider.provider_config == config
        assert provider.provider_config["organization"] == "org-123"

    def test_update_logic(self) -> None:
        """Test partial update."""
        update = ProviderUpdate(name="New Name", timeout=60)
        assert update.name == "New Name"
        assert update.timeout == 60
        assert update.key is None  # Untouched fields should be None
        assert update.model is None
