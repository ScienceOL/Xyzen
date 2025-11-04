"""Tests for Provider model."""

import pytest
from pydantic import ValidationError
from typing import Any
from uuid import uuid4

from models.provider import Provider, ProviderCreate, ProviderUpdate


class TestProviderModel:
    """Test Provider SQLModel."""

    def test_provider_create_valid(self):
        """Test creating a valid provider."""
        data: dict[str, Any] = {
            "user_id": "test-user-123",
            "name": "Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key-123",
            "timeout": 60,
            "model": "gpt-4o",
            "max_tokens": 4096,
            "temperature": 0.7,
            "is_system": False,
            "provider_config": {"organization": "test-org"},
        }
        provider = ProviderCreate(**data)

        assert provider.user_id == "test-user-123"
        assert provider.name == "Test Provider"
        assert provider.provider_type == "openai"
        assert provider.api == "https://api.openai.com/v1"
        assert provider.key == "sk-test-key-123"
        assert provider.timeout == 60
        assert provider.model == "gpt-4o"
        assert provider.max_tokens == 4096
        assert provider.temperature == 0.7
        assert provider.is_system is False
        assert provider.provider_config == {"organization": "test-org"}

    def test_provider_create_minimal(self):
        """Test creating a provider with minimal required fields."""
        data: dict[str, Any] = {
            "user_id": "test-user-123",
            "name": "Minimal Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key-123",
        }
        provider = ProviderCreate(**data)

        assert provider.user_id == "test-user-123"
        assert provider.name == "Minimal Provider"
        assert provider.provider_type == "openai"
        assert provider.timeout == 60  # default value
        assert provider.max_tokens == 4096  # default value
        assert provider.temperature == 0.7  # default value
        assert provider.is_system is False  # default value
        assert provider.provider_config is None  # default value

    def test_provider_create_invalid_name_empty(self):
        """Test creating a provider with empty name."""
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="",  # Invalid: empty string
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
            )

        errors = exc_info.value.errors()
        assert any("String should have at least 1 character" in str(error) for error in errors)

    def test_provider_create_invalid_name_too_long(self):
        """Test creating a provider with name too long."""
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="x" * 101,  # Invalid: too long
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
            )

        errors = exc_info.value.errors()
        assert any("String should have at most 100 characters" in str(error) for error in errors)

    def test_provider_create_invalid_timeout_range(self):
        """Test creating a provider with invalid timeout values."""
        # Test timeout too low
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                timeout=0,  # Invalid: too low
            )

        errors = exc_info.value.errors()
        assert any("Input should be greater than or equal to 1" in str(error) for error in errors)

        # Test timeout too high
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                timeout=301,  # Invalid: too high
            )

        errors = exc_info.value.errors()
        assert any("Input should be less than or equal to 300" in str(error) for error in errors)

    def test_provider_create_invalid_max_tokens_range(self):
        """Test creating a provider with invalid max_tokens values."""
        # Test max_tokens too low
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                max_tokens=0,  # Invalid: too low
            )

        errors = exc_info.value.errors()
        assert any("Input should be greater than or equal to 1" in str(error) for error in errors)

        # Test max_tokens too high
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                max_tokens=128001,  # Invalid: too high
            )

        errors = exc_info.value.errors()
        assert any("Input should be less than or equal to 128000" in str(error) for error in errors)

    def test_provider_create_invalid_temperature_range(self):
        """Test creating a provider with invalid temperature values."""
        # Test temperature too low
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                temperature=-0.1,  # Invalid: too low
            )

        errors = exc_info.value.errors()
        assert any("Input should be greater than or equal to 0" in str(error) for error in errors)

        # Test temperature too high
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(
                user_id="test-user-123",
                name="Test Provider",
                provider_type="openai",
                api="https://api.openai.com/v1",
                key="sk-test-key-123",
                temperature=2.1,  # Invalid: too high
            )

        errors = exc_info.value.errors()
        assert any("Input should be less than or equal to 2" in str(error) for error in errors)

    def test_provider_table_model(self):
        """Test Provider table model with ID generation."""
        provider = Provider(
            user_id="test-user-123",
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key-123",
        )

        # ID should be generated automatically
        assert provider.id is not None
        assert isinstance(provider.id, type(uuid4()))

    def test_provider_update_partial(self):
        """Test Provider update with partial data."""
        update_data = ProviderUpdate(
            name="Updated Provider Name",
            temperature=0.5,
        )

        assert update_data.name == "Updated Provider Name"
        assert update_data.temperature == 0.5
        assert update_data.provider_type is None  # Not updated
        assert update_data.api is None  # Not updated
        assert update_data.key is None  # Not updated

    def test_provider_update_validation(self):
        """Test Provider update validation."""
        # Test invalid name length in update
        with pytest.raises(ValidationError):
            ProviderUpdate(name="")  # Too short

        with pytest.raises(ValidationError):
            ProviderUpdate(name="x" * 101)  # Too long

        # Test invalid temperature in update
        with pytest.raises(ValidationError):
            ProviderUpdate(temperature=-0.1)  # Too low

        with pytest.raises(ValidationError):
            ProviderUpdate(temperature=2.1)  # Too high

    def test_provider_config_json_serialization(self):
        """Test provider_config JSON field behavior."""
        config: dict[str, Any] = {
            "organization": "test-org",
            "custom_settings": {
                "retry_attempts": 3,
                "backoff_factor": 2.0,
            },
            "features": ["streaming", "tools"],
        }

        provider = ProviderCreate(
            user_id="test-user-123",
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key-123",
            provider_config=config,
        )

        assert provider.provider_config == config

        # Test serialization/deserialization
        provider_dict = provider.model_dump()
        assert provider_dict["provider_config"] == config

        # Create new instance from dict
        new_provider = ProviderCreate(**provider_dict)
        assert new_provider.provider_config == config

    @pytest.mark.parametrize("provider_type", ["openai", "azure_openai", "anthropic", "google"])
    def test_provider_types(self, provider_type: str):
        """Test different provider types."""
        provider = ProviderCreate(
            user_id="test-user-123",
            name=f"Test {provider_type} Provider",
            provider_type=provider_type,
            api="https://api.test.com/v1",
            key="test-key-123",
        )

        assert provider.provider_type == provider_type

    def test_system_provider_flag(self):
        """Test system provider functionality."""
        # Regular user provider
        user_provider = ProviderCreate(
            user_id="test-user-123",
            name="User Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key-123",
            is_system=False,
        )
        assert user_provider.is_system is False

        # System provider
        system_provider = ProviderCreate(
            user_id="system",
            name="System Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key-123",
            is_system=True,
        )
        assert system_provider.is_system is True
