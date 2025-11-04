"""Tests for ProviderRepository."""

import pytest
from uuid import uuid4
from sqlmodel.ext.asyncio.session import AsyncSession

from models.provider import Provider, ProviderCreate, ProviderUpdate
from repo.provider import ProviderRepository


class TestProviderRepository:
    """Test ProviderRepository database operations."""

    @pytest.fixture
    def provider_repo(self, db_session: AsyncSession) -> ProviderRepository:
        """Create a ProviderRepository instance for testing."""
        return ProviderRepository(db=db_session)

    @pytest.fixture
    async def sample_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a sample provider for testing."""
        provider_data = ProviderCreate(
            user_id="test-user-123",
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key-123",
            model="gpt-4o",
            max_tokens=4096,
            temperature=0.7,
            is_system=False,
        )
        provider = await provider_repo.create_provider(provider_data, user_id="test-user-123")
        await provider_repo.db.commit()
        # Refresh to ensure all attributes are loaded
        await provider_repo.db.refresh(provider)
        return provider

    @pytest.fixture
    async def system_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a system provider for testing."""
        provider_data = ProviderCreate(
            user_id="system",
            name="System Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-system-key-456",
            model="gpt-4o",
            max_tokens=8192,
            temperature=0.5,
            is_system=True,
        )
        provider = await provider_repo.create_provider(provider_data, user_id="system")
        await provider_repo.db.commit()
        # Refresh to ensure all attributes are loaded
        await provider_repo.db.refresh(provider)
        return provider

    async def test_create_provider(self, provider_repo: ProviderRepository):
        """Test creating a new provider."""
        provider_data = ProviderCreate(
            user_id="test-user-456",
            name="New Test Provider",
            provider_type="anthropic",
            api="https://api.anthropic.com",
            key="sk-ant-test-key-789",
            model="claude-3-5-sonnet-20241022",
            max_tokens=8192,
            temperature=0.6,
            is_system=False,
            provider_config={"version": "2023-06-01"},
        )

        provider = await provider_repo.create_provider(provider_data, user_id="test-user-456")

        # Verify the provider was created with correct data
        assert provider.id is not None
        assert provider.user_id == "test-user-456"
        assert provider.name == "New Test Provider"
        assert provider.provider_type == "anthropic"
        assert provider.api == "https://api.anthropic.com"
        assert provider.key == "sk-ant-test-key-789"
        assert provider.model == "claude-3-5-sonnet-20241022"
        assert provider.max_tokens == 8192
        assert provider.temperature == 0.6
        assert provider.is_system is False

        # Verify it can be retrieved
        retrieved_provider = await provider_repo.get_provider_by_id(provider.id)
        assert retrieved_provider is not None
        assert retrieved_provider.name == "New Test Provider"

    async def test_get_provider_by_id_existing(self, provider_repo: ProviderRepository, sample_provider: Provider):
        """Test retrieving an existing provider by ID."""
        retrieved_provider = await provider_repo.get_provider_by_id(sample_provider.id)

        assert retrieved_provider is not None
        assert retrieved_provider.id == sample_provider.id
        assert retrieved_provider.name == sample_provider.name
        assert retrieved_provider.user_id == sample_provider.user_id

    async def test_get_provider_by_id_nonexistent(self, provider_repo: ProviderRepository):
        """Test retrieving a non-existent provider by ID."""
        nonexistent_id = uuid4()
        retrieved_provider = await provider_repo.get_provider_by_id(nonexistent_id)

        assert retrieved_provider is None

    async def test_get_providers_by_user_include_system(
        self, provider_repo: ProviderRepository, sample_provider: Provider, system_provider: Provider
    ):
        """Test retrieving providers for a user including system providers."""
        providers = await provider_repo.get_providers_by_user("test-user-123", include_system=True)

        # Should include both user provider and system provider
        assert len(providers) >= 2
        provider_names = [p.name for p in providers]
        assert "Test Provider" in provider_names
        assert "System Provider" in provider_names

        # Check that we have both user and system providers
        user_providers = [p for p in providers if not p.is_system]
        system_providers = [p for p in providers if p.is_system]
        assert len(user_providers) >= 1
        assert len(system_providers) >= 1

    async def test_get_providers_by_user_exclude_system(
        self, provider_repo: ProviderRepository, sample_provider: Provider, system_provider: Provider
    ):
        """Test retrieving providers for a user excluding system providers."""
        providers = await provider_repo.get_providers_by_user("test-user-123", include_system=False)

        # Should only include user's own providers
        assert len(providers) >= 1
        for provider in providers:
            assert not provider.is_system
            assert provider.user_id == "test-user-123"

    async def test_get_providers_by_user_no_providers(self, provider_repo: ProviderRepository):
        """Test retrieving providers for a user with no providers."""
        providers = await provider_repo.get_providers_by_user("nonexistent-user", include_system=False)

        assert len(providers) == 0

    async def test_get_system_provider(self, provider_repo: ProviderRepository, system_provider: Provider):
        """Test retrieving the system provider."""
        retrieved_provider = await provider_repo.get_system_provider()

        assert retrieved_provider is not None
        assert retrieved_provider.is_system is True
        assert retrieved_provider.name == "System Provider"

    async def test_get_system_provider_not_exists(self, provider_repo: ProviderRepository):
        """Test retrieving system provider when none exists."""
        # Clean up ALL system providers from other tests
        from sqlmodel import select

        statement = select(Provider).where(Provider.is_system == True)  # noqa: E712
        result = await provider_repo.db.exec(statement)
        system_providers = list(result.all())

        for provider in system_providers:
            await provider_repo.delete_provider(provider.id)

        await provider_repo.db.commit()

        # Now test that no system provider exists
        retrieved_provider = await provider_repo.get_system_provider()

        assert retrieved_provider is None

    async def test_update_provider_existing(self, provider_repo: ProviderRepository, sample_provider: Provider):
        """Test updating an existing provider."""
        update_data = ProviderUpdate(
            name="Updated Provider Name",
            temperature=0.8,
            max_tokens=2048,
        )

        updated_provider = await provider_repo.update_provider(sample_provider.id, update_data)

        assert updated_provider is not None
        assert updated_provider.id == sample_provider.id
        assert updated_provider.name == "Updated Provider Name"
        assert updated_provider.temperature == 0.8
        assert updated_provider.max_tokens == 2048

        # Verify unchanged fields remain the same
        assert updated_provider.provider_type == sample_provider.provider_type
        assert updated_provider.api == sample_provider.api
        assert updated_provider.key == sample_provider.key

    async def test_update_provider_partial(self, provider_repo: ProviderRepository, sample_provider: Provider):
        """Test partial update of a provider."""
        original_temperature = sample_provider.temperature

        update_data = ProviderUpdate(name="Partially Updated Name")

        updated_provider = await provider_repo.update_provider(sample_provider.id, update_data)

        assert updated_provider is not None
        assert updated_provider.name == "Partially Updated Name"
        assert updated_provider.temperature == original_temperature  # Should remain unchanged

    async def test_update_provider_nonexistent(self, provider_repo: ProviderRepository):
        """Test updating a non-existent provider."""
        nonexistent_id = uuid4()
        update_data = ProviderUpdate(name="Should Not Work")

        updated_provider = await provider_repo.update_provider(nonexistent_id, update_data)

        assert updated_provider is None

    async def test_delete_provider_existing(self, provider_repo: ProviderRepository, sample_provider: Provider):
        """Test deleting an existing provider."""
        provider_id = sample_provider.id

        # Verify provider exists before deletion
        existing_provider = await provider_repo.get_provider_by_id(provider_id)
        assert existing_provider is not None

        # Delete the provider
        result = await provider_repo.delete_provider(provider_id)
        assert result is True

        # Verify provider no longer exists
        deleted_provider = await provider_repo.get_provider_by_id(provider_id)
        assert deleted_provider is None

    async def test_delete_provider_nonexistent(self, provider_repo: ProviderRepository):
        """Test deleting a non-existent provider."""
        nonexistent_id = uuid4()

        result = await provider_repo.delete_provider(nonexistent_id)
        assert result is False

    async def test_provider_config_persistence(self, provider_repo: ProviderRepository):
        """Test that provider_config JSON field is properly persisted."""
        config = {
            "organization": "test-org",
            "custom_settings": {
                "retry_attempts": 3,
                "backoff_factor": 2.0,
            },
            "features": ["streaming", "tools"],
        }

        provider_data = ProviderCreate(
            user_id="test-user-config",
            name="Config Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-config-test-key",
            provider_config=config,
        )

        provider = await provider_repo.create_provider(provider_data, user_id="test-user-config")
        await provider_repo.db.commit()
        # Refresh to ensure all attributes are loaded
        await provider_repo.db.refresh(provider)

        # Retrieve and verify config is preserved
        retrieved_provider = await provider_repo.get_provider_by_id(provider.id)
        assert retrieved_provider is not None
        assert retrieved_provider.provider_config == config

    async def test_multiple_users_isolation(self, provider_repo: ProviderRepository):
        """Test that providers are properly isolated between users."""
        # Create providers for different users
        provider1_data = ProviderCreate(
            user_id="user-1",
            name="User1 Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-user1-key",
        )
        await provider_repo.create_provider(provider1_data, user_id="user-1")

        provider2_data = ProviderCreate(
            user_id="user-2",
            name="User2 Provider",
            provider_type="anthropic",
            api="https://api.anthropic.com",
            key="sk-user2-key",
        )
        await provider_repo.create_provider(provider2_data, user_id="user-2")

        await provider_repo.db.commit()

        # Verify user1 only sees their provider
        user1_providers = await provider_repo.get_providers_by_user("user-1", include_system=False)
        user1_names = [p.name for p in user1_providers]
        assert "User1 Provider" in user1_names
        assert "User2 Provider" not in user1_names

        # Verify user2 only sees their provider
        user2_providers = await provider_repo.get_providers_by_user("user-2", include_system=False)
        user2_names = [p.name for p in user2_providers]
        assert "User2 Provider" in user2_names
        assert "User1 Provider" not in user2_names

    @pytest.mark.parametrize("provider_type", ["openai", "azure_openai", "anthropic", "google"])
    async def test_different_provider_types(self, provider_repo: ProviderRepository, provider_type: str):
        """Test creating providers of different types."""
        provider_data = ProviderCreate(
            user_id="test-user-types",
            name=f"{provider_type.title()} Provider",
            provider_type=provider_type,
            api="https://api.test.com/v1",
            key="sk-test-key",
        )

        provider = await provider_repo.create_provider(provider_data, user_id="test-user-types")

        assert provider.provider_type == provider_type
        assert provider.name == f"{provider_type.title()} Provider"
