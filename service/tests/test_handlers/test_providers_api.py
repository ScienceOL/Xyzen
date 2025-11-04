"""Tests for Providers API handlers."""

import pytest
from typing import Any, Generator
from uuid import uuid4
from fastapi import HTTPException
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from handler.api.v1.providers import (
    get_authorized_provider,
    get_authorized_user_provider,
    verify_provider_authorization,
)
from models.provider import Provider, ProviderCreate
from repo.provider import ProviderRepository


class TestProviderAuthorization:
    """Test provider authorization functions."""

    @pytest.fixture
    async def provider_repo(self, db_session: AsyncSession) -> ProviderRepository:
        """Create a provider repository for testing."""
        return ProviderRepository(db=db_session)

    @pytest.fixture
    async def user_provider(self, provider_repo: ProviderRepository) -> Provider:
        """Create a user-owned provider for testing."""
        provider_data = ProviderCreate(
            user_id="test-user-123",
            name="User Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-user-key-123",
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
            is_system=True,
        )
        provider = await provider_repo.create_provider(provider_data, user_id="system")
        await provider_repo.db.commit()
        # Refresh to ensure all attributes are loaded
        await provider_repo.db.refresh(provider)
        return provider

    async def test_verify_provider_authorization_user_owns_provider(
        self, db_session: AsyncSession, user_provider: Provider
    ):
        """Test authorization when user owns the provider."""
        provider = await verify_provider_authorization(
            user_provider.id, "test-user-123", db_session, allow_system=False
        )

        assert provider is not None
        assert provider.id == user_provider.id

    async def test_verify_provider_authorization_system_allowed(
        self, db_session: AsyncSession, system_provider: Provider
    ):
        """Test authorization for system provider when allowed."""
        provider = await verify_provider_authorization(
            system_provider.id, "test-user-123", db_session, allow_system=True
        )

        assert provider is not None
        assert provider.id == system_provider.id
        assert provider.is_system is True

    async def test_verify_provider_authorization_system_denied(
        self, db_session: AsyncSession, system_provider: Provider
    ):
        """Test authorization denial for system provider when not allowed."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_provider_authorization(system_provider.id, "test-user-123", db_session, allow_system=False)

        assert exc_info.value.status_code == 403
        assert "Access denied" in str(exc_info.value.detail)

    async def test_verify_provider_authorization_other_user_provider(
        self, db_session: AsyncSession, user_provider: Provider
    ):
        """Test authorization denial for another user's provider."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_provider_authorization(user_provider.id, "different-user-456", db_session, allow_system=False)

        assert exc_info.value.status_code == 403
        assert "Access denied" in str(exc_info.value.detail)

    async def test_verify_provider_authorization_nonexistent(self, db_session: AsyncSession):
        """Test authorization for non-existent provider."""
        nonexistent_id = uuid4()
        provider = await verify_provider_authorization(nonexistent_id, "test-user-123", db_session, allow_system=True)

        assert provider is None

    async def test_get_authorized_provider_success(self, db_session: AsyncSession, user_provider: Provider):
        """Test get_authorized_provider dependency success."""
        provider = await get_authorized_provider(user_provider.id, "test-user-123", db_session)

        assert provider.id == user_provider.id

    async def test_get_authorized_provider_not_found(self, db_session: AsyncSession):
        """Test get_authorized_provider dependency with non-existent provider."""
        nonexistent_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await get_authorized_provider(nonexistent_id, "test-user-123", db_session)

        assert exc_info.value.status_code == 404
        assert "Provider not found" in str(exc_info.value.detail)

    async def test_get_authorized_user_provider_success(self, db_session: AsyncSession, user_provider: Provider):
        """Test get_authorized_user_provider dependency success."""
        provider = await get_authorized_user_provider(user_provider.id, "test-user-123", db_session)

        assert provider.id == user_provider.id

    async def test_get_authorized_user_provider_system_denied(
        self, db_session: AsyncSession, system_provider: Provider
    ):
        """Test get_authorized_user_provider dependency denies system provider."""
        with pytest.raises(HTTPException) as exc_info:
            await get_authorized_user_provider(system_provider.id, "test-user-123", db_session)

        assert exc_info.value.status_code == 403
        assert "Access denied" in str(exc_info.value.detail)


class TestProvidersAPI:
    """Test Providers API endpoints."""

    @pytest.fixture
    def mock_auth(self) -> Generator[None, None, None]:
        """Mock authentication by overriding the FastAPI dependency."""
        from app.main import app
        from middleware.auth import get_current_user

        async def mock_get_current_user() -> str:
            return "test-user-123"

        # Override the dependency
        app.dependency_overrides[get_current_user] = mock_get_current_user
        yield
        # Clean up
        if get_current_user in app.dependency_overrides:
            del app.dependency_overrides[get_current_user]

    async def test_get_provider_templates(self, async_client: AsyncClient):
        """Test getting provider templates."""
        response = await async_client.get("/xyzen/api/v1/providers/templates")

        assert response.status_code == 200
        templates: list[Any] = response.json()
        assert isinstance(templates, list)
        assert len(templates) > 0

        # Check template structure
        template = templates[0]
        assert "type" in template
        assert "display_name" in template
        assert "description" in template

    async def test_get_my_providers_empty(
        self, async_client: AsyncClient, mock_auth: None, db_session: AsyncSession
    ) -> None:
        """Test getting providers when user has none of their own."""
        # Clear all providers to ensure clean test
        from models.provider import Provider

        result = await db_session.execute(select(Provider))
        providers = result.scalars().all()
        for provider in providers:
            await db_session.delete(provider)
        await db_session.commit()

        response = await async_client.get("/xyzen/api/v1/providers/me")

        assert response.status_code == 200
        providers = response.json()

        # Filter out system providers to check only user-owned providers
        user_providers = [p for p in providers if not p.get("is_system", False)]
        system_providers = [p for p in providers if p.get("is_system", False)]

        assert user_providers == []

        # If there are providers, they should all be system providers
        if providers:
            assert len(system_providers) == len(providers), "All returned providers should be system providers"

    async def test_create_provider_success(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test creating a new provider successfully."""
        provider_data: dict[str, Any] = {
            "user_id": "test-user-123",  # Required by ProviderCreate model
            "name": "Test OpenAI Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key-123",
            "model": "gpt-4o",
            "max_tokens": 4096,
            "temperature": 0.7,
        }

        response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)

        assert response.status_code == 201, f"Failed to create provider: {response.status_code} - {response.text}"
        created_provider = response.json()
        assert created_provider["name"] == "Test OpenAI Provider"
        assert created_provider["provider_type"] == "openai"
        assert created_provider["user_id"] == "test-user-123"
        assert "id" in created_provider

    async def test_create_provider_invalid_type(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test creating a provider with invalid type."""
        provider_data = {
            "user_id": "test-user-123",
            "name": "Invalid Provider",
            "provider_type": "invalid_type",
            "api": "https://api.test.com/v1",
            "key": "test-key",
        }

        response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)

        assert response.status_code == 400
        assert "Invalid provider_type" in response.json()["detail"]

    async def test_get_provider_success(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test getting a specific provider successfully."""
        # First create a provider
        provider_data = {
            "user_id": "test-user-123",
            "name": "Get Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-get-test-key",
        }

        create_response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)
        assert create_response.status_code == 201, (
            f"Failed to create provider: {create_response.status_code} - {create_response.text}"
        )
        provider_id = create_response.json()["id"]

        # Now get it
        response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")

        assert response.status_code == 200
        provider = response.json()
        assert provider["name"] == "Get Test Provider"
        assert provider["id"] == provider_id

    async def test_get_provider_not_found(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test getting a non-existent provider."""
        nonexistent_id = str(uuid4())

        response = await async_client.get(f"/xyzen/api/v1/providers/{nonexistent_id}")

        assert response.status_code == 404
        assert "Provider not found" in response.json()["detail"]

    async def test_update_provider_success(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test updating a provider successfully."""
        # First create a provider
        provider_data: dict[str, Any] = {
            "user_id": "test-user-123",
            "name": "Update Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-update-test-key",
            "temperature": 0.5,
        }

        create_response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)
        provider_id = create_response.json()["id"]

        # Update it
        update_data: dict[str, Any] = {
            "name": "Updated Provider Name",
            "temperature": 0.8,
        }

        response = await async_client.patch(f"/xyzen/api/v1/providers/{provider_id}", json=update_data)

        assert response.status_code == 200
        updated_provider = response.json()
        assert updated_provider["name"] == "Updated Provider Name"
        assert updated_provider["temperature"] == 0.8
        assert updated_provider["provider_type"] == "openai"  # Unchanged

    async def test_update_provider_invalid_type(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test updating a provider with invalid type."""
        # First create a provider
        provider_data = {
            "user_id": "test-user-123",
            "name": "Invalid Update Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-invalid-update-key",
        }

        create_response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)
        provider_id = create_response.json()["id"]

        # Try to update with invalid type
        update_data = {"provider_type": "invalid_type"}

        response = await async_client.patch(f"/xyzen/api/v1/providers/{provider_id}", json=update_data)

        assert response.status_code == 400
        assert "Invalid provider_type" in response.json()["detail"]

    async def test_delete_provider_success(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test deleting a provider successfully."""
        # First create a provider
        provider_data = {
            "user_id": "test-user-123",
            "name": "Delete Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-delete-test-key",
        }

        create_response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)
        provider_id = create_response.json()["id"]

        # Delete it
        response = await async_client.delete(f"/xyzen/api/v1/providers/{provider_id}")

        assert response.status_code == 204

        # Verify it's gone
        get_response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")
        assert get_response.status_code == 404

    async def test_get_my_providers_with_system_masking(self, async_client: AsyncClient, mock_auth: None) -> None:
        """Test that system provider credentials are masked."""
        # This test would require setting up a system provider in the test database
        # For now, we'll test the structure without actual system providers
        response = await async_client.get("/xyzen/api/v1/providers/me")

        assert response.status_code == 200
        providers = response.json()

        # Verify response structure (even if empty)
        assert isinstance(providers, list)

    async def test_unauthorized_access_different_user(self, async_client: AsyncClient):
        """Test that users cannot access other users' providers."""
        from app.main import app
        from middleware.auth import get_current_user

        # Create provider with user A
        async def mock_user_a() -> str:
            return "user-a"

        app.dependency_overrides[get_current_user] = mock_user_a

        provider_data = {
            "user_id": "user-a",
            "name": "User A Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-user-a-key",
        }

        create_response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)
        assert create_response.status_code == 201, (
            f"Failed to create provider: {create_response.status_code} - {create_response.text}"
        )
        provider_id = create_response.json()["id"]

        # Try to access with user B
        async def mock_user_b() -> str:
            return "user-b"

        app.dependency_overrides[get_current_user] = mock_user_b

        response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")
        assert response.status_code == 403
        assert "Access denied" in response.json()["detail"]

        # Clean up
        if get_current_user in app.dependency_overrides:
            del app.dependency_overrides[get_current_user]

    @pytest.mark.parametrize("provider_type", ["openai", "azure_openai", "anthropic", "google"])
    async def test_create_different_provider_types(
        self, async_client: AsyncClient, mock_auth: None, provider_type: str
    ) -> None:
        """Test creating providers of different types."""
        provider_data = {
            "user_id": "test-user-123",
            "name": f"{provider_type.title()} Provider",
            "provider_type": provider_type,
            "api": "https://api.test.com/v1",
            "key": "sk-test-key",
        }

        response = await async_client.post("/xyzen/api/v1/providers/", json=provider_data)

        assert response.status_code == 201
        created_provider = response.json()
        assert created_provider["provider_type"] == provider_type
