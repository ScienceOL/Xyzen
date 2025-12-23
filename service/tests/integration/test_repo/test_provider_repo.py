import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.repos.provider import ProviderRepository
from app.schemas.provider import ProviderScope, ProviderType
from tests.factories.provider import ProviderCreateFactory


@pytest.mark.integration
class TestProviderRepository:
    """Integration tests for ProviderRepository."""

    @pytest.fixture
    def provider_repo(self, db_session: AsyncSession) -> ProviderRepository:
        return ProviderRepository(db_session)

    async def test_create_and_get_provider(self, provider_repo: ProviderRepository):
        """Test creating a provider and retrieving it."""
        user_id = "test-user-provider-repo"
        # Create
        provider_data = ProviderCreateFactory.build(scope=ProviderScope.USER, provider_type=ProviderType.OPENAI)
        created_provider = await provider_repo.create_provider(provider_data, user_id)

        assert created_provider.id is not None
        assert created_provider.user_id == user_id
        # 'key' attribute based on model definition
        assert created_provider.key is not None

        # Get by ID
        fetched = await provider_repo.get_provider_by_id(created_provider.id)
        assert fetched is not None
        assert fetched.id == created_provider.id

    async def test_get_providers_by_user(self, provider_repo: ProviderRepository):
        """Test listing providers for a user."""
        user_id = "test-user-provider-list"

        # Create 2 user providers with DIFFERENT types to avoid (provider_type, scope, user_id) unique constraint
        await provider_repo.create_provider(
            ProviderCreateFactory.build(scope=ProviderScope.USER, provider_type=ProviderType.OPENAI), user_id
        )
        await provider_repo.create_provider(
            ProviderCreateFactory.build(scope=ProviderScope.USER, provider_type=ProviderType.GOOGLE), user_id
        )

        providers = await provider_repo.get_providers_by_user(user_id, include_system=False)
        assert len(providers) == 2
        for p in providers:
            # We created them as USER scope, so they should be returned
            assert p.user_id == user_id

    async def test_get_system_provider(self, provider_repo: ProviderRepository):
        """Test fetching system provider."""
        # Check if one already exists (from other tests or seeds or system init) to avoid constraint error
        # In a fresh memory DB it implies none exists unless seeded by app startup logic which we might mock/bypass
        existing = await provider_repo.get_system_provider()

        if not existing:
            # Create system provider
            # System providers might not need user_id or use "admin"
            system_admin_id = None
            provider_data = ProviderCreateFactory.build(scope=ProviderScope.SYSTEM)
            await provider_repo.create_provider(provider_data, system_admin_id)

        # Repository has singular 'get_system_provider'
        system_provider = await provider_repo.get_system_provider()
        assert system_provider is not None
        assert system_provider.scope == ProviderScope.SYSTEM

    async def test_update_provider(self, provider_repo: ProviderRepository):
        """Test updating a provider."""
        user_id = "test-user-update"
        created = await provider_repo.create_provider(
            ProviderCreateFactory.build(provider_type=ProviderType.OPENAI), user_id
        )

        from app.models.provider import ProviderUpdate

        update_data = ProviderUpdate(name="Updated Name")
        updated = await provider_repo.update_provider(created.id, update_data)

        assert updated is not None
        assert updated.name == "Updated Name"

        # Verify persistence
        fetched = await provider_repo.get_provider_by_id(created.id)
        assert fetched is not None
        assert fetched.name == "Updated Name"

    async def test_delete_provider(self, provider_repo: ProviderRepository):
        """Test deleting a provider."""
        user_id = "test-user-delete"
        created = await provider_repo.create_provider(
            ProviderCreateFactory.build(provider_type=ProviderType.OPENAI), user_id
        )

        success = await provider_repo.delete_provider(created.id)
        assert success is True

        fetched = await provider_repo.get_provider_by_id(created.id)
        assert fetched is None
