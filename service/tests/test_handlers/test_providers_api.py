"""Tests for Providers API handlers."""

import pytest
from uuid import uuid4
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.main import app
from core.auth import AuthorizationService
from common.code import ErrCode, ErrCodeError
from middleware.auth import get_current_user
from models.provider import Provider, ProviderCreate
from repo.provider import ProviderRepository


class TestProviderAuthorization:
    """Test provider authorization through AuthorizationService."""

    @pytest.fixture
    async def provider_repo(self, db_session: AsyncSession) -> ProviderRepository:
        """Create a provider repository for testing."""
        return ProviderRepository(db=db_session)

    @pytest.fixture
    async def auth_service(self, db_session: AsyncSession) -> AuthorizationService:
        """Create authorization service for testing."""
        return AuthorizationService(db_session)

    @pytest.fixture
    async def user_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a user-owned provider for testing."""
        provider_data = ProviderCreate(
            user_id="test-user-123",
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="test-key",
        )
        return await provider_repo.create_provider(provider_data, "test-user-123")

    @pytest.fixture
    async def system_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a system provider for testing."""
        provider_data = ProviderCreate(
            user_id="system",
            name="System Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="system-key",
            is_system=True,
        )
        return await provider_repo.create_provider(provider_data, "system")

    @pytest.mark.asyncio
    async def test_authorize_provider_read_user_owns_provider(
        self, db_session: AsyncSession, auth_service: AuthorizationService, user_provider: Provider
    ):
        """Test successful provider read authorization for owner."""
        provider = await auth_service.authorize_provider_read(user_provider.id, "test-user-123")
        assert provider.id == user_provider.id
        assert provider.user_id == "test-user-123"

    @pytest.mark.asyncio
    async def test_authorize_provider_read_system_provider_allowed(
        self, db_session: AsyncSession, auth_service: AuthorizationService, system_provider: Provider
    ):
        """Test that users can read system providers."""
        provider = await auth_service.authorize_provider_read(system_provider.id, "test-user-123")
        assert provider.id == system_provider.id
        assert provider.is_system is True

    @pytest.mark.asyncio
    async def test_authorize_provider_read_access_denied(
        self, db_session: AsyncSession, auth_service: AuthorizationService, user_provider: Provider
    ):
        """Test provider read authorization denied for non-owner."""
        with pytest.raises(ErrCodeError) as exc_info:
            await auth_service.authorize_provider_read(user_provider.id, "different-user-456")

        assert exc_info.value.code == ErrCode.PROVIDER_ACCESS_DENIED

    @pytest.mark.asyncio
    async def test_authorize_provider_read_not_found(
        self, db_session: AsyncSession, auth_service: AuthorizationService
    ):
        """Test provider read authorization with non-existent provider."""
        nonexistent_id = uuid4()
        with pytest.raises(ErrCodeError) as exc_info:
            await auth_service.authorize_provider_read(nonexistent_id, "test-user-123")

        assert exc_info.value.code == ErrCode.PROVIDER_NOT_FOUND

    @pytest.mark.asyncio
    async def test_authorize_provider_write_success(
        self, db_session: AsyncSession, auth_service: AuthorizationService, user_provider: Provider
    ):
        """Test successful provider write authorization for owner."""
        provider = await auth_service.authorize_provider_write(user_provider.id, "test-user-123")
        assert provider.id == user_provider.id

    @pytest.mark.asyncio
    async def test_authorize_provider_write_system_provider_denied(
        self, db_session: AsyncSession, auth_service: AuthorizationService, system_provider: Provider
    ):
        """Test that system providers cannot be modified."""
        with pytest.raises(ErrCodeError) as exc_info:
            await auth_service.authorize_provider_write(system_provider.id, "test-user-123")

        assert exc_info.value.code == ErrCode.PROVIDER_SYSTEM_READONLY

    @pytest.mark.asyncio
    async def test_authorize_provider_delete_success(
        self, db_session: AsyncSession, auth_service: AuthorizationService, user_provider: Provider
    ):
        """Test successful provider delete authorization for owner."""
        provider = await auth_service.authorize_provider_delete(user_provider.id, "test-user-123")
        assert provider.id == user_provider.id

    @pytest.mark.asyncio
    async def test_authorize_provider_delete_system_provider_denied(
        self, db_session: AsyncSession, auth_service: AuthorizationService, system_provider: Provider
    ):
        """Test that system providers cannot be deleted."""
        with pytest.raises(ErrCodeError) as exc_info:
            await auth_service.authorize_provider_delete(system_provider.id, "test-user-123")

        assert exc_info.value.code == ErrCode.PROVIDER_SYSTEM_READONLY


class TestProvidersAPI:
    """Test provider API endpoints."""

    @pytest.fixture(autouse=True)
    def mock_auth(self):
        """Mock authentication for all tests in this class."""

        def mock_get_current_user():
            return "test-user-123"

        app.dependency_overrides[get_current_user] = mock_get_current_user
        yield
        app.dependency_overrides.clear()

    @pytest.fixture
    async def provider_repo(self, db_session: AsyncSession) -> ProviderRepository:
        """Create a provider repository for testing."""
        return ProviderRepository(db=db_session)

    @pytest.fixture
    async def test_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a test provider."""
        provider_data = ProviderCreate(
            user_id="test-user-123",
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="test-key",
        )
        return await provider_repo.create_provider(provider_data, "test-user-123")

    @pytest.fixture
    async def system_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a system provider."""
        provider_data = ProviderCreate(
            user_id="system",
            name="System Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="system-key",
            is_system=True,
        )
        return await provider_repo.create_provider(provider_data, "system")

    @pytest.mark.asyncio
    async def test_get_provider_templates(self, async_client: AsyncClient):
        """Test retrieving provider templates."""
        response = await async_client.get("/xyzen/api/v1/providers/templates")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    @pytest.mark.asyncio
    async def test_get_my_providers(self, async_client: AsyncClient, test_provider: Provider):
        """Test retrieving user's providers."""
        response = await async_client.get("/xyzen/api/v1/providers/me", headers={"Authorization": "Bearer test-token"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_create_provider_success(self, async_client: AsyncClient):
        """Test successful provider creation."""
        provider_data = {
            "user_id": "test-user-123",
            "name": "New Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "new-test-key",
            "timeout": 60,
            "max_tokens": 4096,
            "temperature": 0.7,
        }
        response = await async_client.post(
            "/xyzen/api/v1/providers/", json=provider_data, headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == provider_data["name"]
        assert data["provider_type"] == provider_data["provider_type"]

    @pytest.mark.asyncio
    async def test_get_provider_success(self, async_client: AsyncClient, test_provider: Provider):
        """Test successful provider retrieval."""
        response = await async_client.get(
            f"/xyzen/api/v1/providers/{test_provider.id}", headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_provider.id)
        assert data["name"] == test_provider.name

    @pytest.mark.asyncio
    async def test_get_provider_not_found(self, async_client: AsyncClient):
        """Test provider not found error."""
        nonexistent_id = uuid4()
        response = await async_client.get(
            f"/xyzen/api/v1/providers/{nonexistent_id}", headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_provider_success(self, async_client: AsyncClient, test_provider: Provider):
        """Test successful provider update."""
        update_data = {
            "name": "Updated Provider Name",
            "timeout": 120,
        }
        response = await async_client.patch(
            f"/xyzen/api/v1/providers/{test_provider.id}",
            json=update_data,
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["timeout"] == update_data["timeout"]

    @pytest.mark.asyncio
    async def test_delete_provider_success(self, async_client: AsyncClient, test_provider: Provider):
        """Test successful provider deletion."""
        response = await async_client.delete(
            f"/xyzen/api/v1/providers/{test_provider.id}", headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 204

        # Verify provider is deleted
        get_response = await async_client.get(
            f"/xyzen/api/v1/providers/{test_provider.id}", headers={"Authorization": "Bearer test-token"}
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthorized_access_different_user(self, async_client: AsyncClient, db_session: AsyncSession):
        """Test unauthorized access to another user's provider."""
        # Create a provider for a different user
        provider_repo = ProviderRepository(db_session)
        provider_data = ProviderCreate(
            user_id="different-user",
            name="Other User Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="other-key",
        )
        other_user_provider = await provider_repo.create_provider(provider_data, "different-user")

        # Try to access with different user token
        response = await async_client.get(
            f"/xyzen/api/v1/providers/{other_user_provider.id}",
            headers={"Authorization": "Bearer test-token"},  # This token is for test-user-123
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_system_provider_readonly(self, async_client: AsyncClient, system_provider: Provider):
        """Test that system providers cannot be modified."""
        update_data = {"name": "Modified System Provider"}

        response = await async_client.patch(
            f"/xyzen/api/v1/providers/{system_provider.id}",
            json=update_data,
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 403

        # Test deletion is also forbidden
        delete_response = await async_client.delete(
            f"/xyzen/api/v1/providers/{system_provider.id}", headers={"Authorization": "Bearer test-token"}
        )
        assert delete_response.status_code == 403


__all__ = ["TestProviderAuthorization", "TestProvidersAPI"]
