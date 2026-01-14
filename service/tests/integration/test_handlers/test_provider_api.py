import pytest
from httpx import AsyncClient

from app.schemas.provider import ProviderScope, ProviderType
from tests.factories.provider import ProviderCreateFactory


@pytest.mark.integration
class TestProviderAPI:
    """Integration tests for Provider API endpoints."""

    async def test_create_provider_endpoint_forbidden(self, async_client: AsyncClient):
        """Test POST /api/v1/providers/ returns 403 (user providers disabled)"""
        payload = ProviderCreateFactory.build(
            scope=ProviderScope.USER,
            provider_type=ProviderType.OPENAI,
            name="Test API Provider",
            key="sk-test-key",
            api="https://api.openai.com/v1",
        ).model_dump(mode="json")

        response = await async_client.post("/xyzen/api/v1/providers/", json=payload)
        assert response.status_code == 403
        data = response.json()
        assert "disabled" in data["detail"].lower()

    async def test_get_my_providers(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/me returns only system providers"""
        # List providers (should only return system providers)
        response = await async_client.get("/xyzen/api/v1/providers/me")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned providers should be system providers
        for provider in data:
            assert provider["is_system"] is True

    async def test_get_system_providers(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/system returns system providers or 404 if none configured"""
        response = await async_client.get("/xyzen/api/v1/providers/system")
        # 200 if system providers exist, 404 if none configured
        assert response.status_code in (200, 404)

        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            # All returned providers should be system providers
            for provider in data:
                assert provider["is_system"] is True
                # Sensitive data should be masked
                assert provider["key"] == "••••••••"
                assert provider["api"] == "•••••••••••••••••"

    async def test_get_provider_detail(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/{id} for system provider"""
        # Get list of system providers first
        list_response = await async_client.get("/xyzen/api/v1/providers/system")
        if list_response.status_code == 404:
            pytest.skip("No system providers configured for testing")

        assert list_response.status_code == 200
        providers = list_response.json()

        if not providers:
            pytest.skip("No system providers configured for testing")

        provider_id = providers[0]["id"]

        # Get specific provider
        response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == provider_id
        assert data["is_system"] is True
        # Sensitive data should be masked for system providers
        assert data["key"] == "••••••••"

    async def test_delete_provider_forbidden(self, async_client: AsyncClient):
        """Test DELETE /api/v1/providers/{id} for system provider is forbidden"""
        # Get list of system providers first
        list_response = await async_client.get("/xyzen/api/v1/providers/system")
        if list_response.status_code == 404:
            pytest.skip("No system providers configured for testing")

        assert list_response.status_code == 200
        providers = list_response.json()

        if not providers:
            pytest.skip("No system providers configured for testing")

        provider_id = providers[0]["id"]

        # Try to delete system provider (should fail)
        response = await async_client.delete(f"/xyzen/api/v1/providers/{provider_id}")
        # Should return 403 (Forbidden) since system providers can't be deleted
        assert response.status_code == 403

    async def test_get_available_models(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/available-models returns models for system providers"""
        response = await async_client.get("/xyzen/api/v1/providers/available-models")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        # Should return a dict mapping provider IDs to model lists
        for provider_id, models in data.items():
            assert isinstance(models, list)

    async def test_get_provider_models(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/{provider_id}/models"""
        # Get list of system providers first
        list_response = await async_client.get("/xyzen/api/v1/providers/system")
        if list_response.status_code == 404:
            pytest.skip("No system providers configured for testing")

        assert list_response.status_code == 200
        providers = list_response.json()

        if not providers:
            pytest.skip("No system providers configured for testing")

        provider_id = providers[0]["id"]

        # Get models for specific provider
        response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}/models")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
