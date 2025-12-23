import pytest
from httpx import AsyncClient

from app.schemas.provider import ProviderScope, ProviderType
from tests.factories.provider import ProviderCreateFactory


@pytest.mark.integration
class TestProviderAPI:
    """Integration tests for Provider API endpoints."""

    async def test_create_provider_endpoint(self, async_client: AsyncClient):
        """Test POST /api/v1/providers/"""
        payload = ProviderCreateFactory.build(
            scope=ProviderScope.USER,
            provider_type=ProviderType.OPENAI,
            name="Test API Provider",
            key="sk-test-key",
            api="https://api.openai.com/v1",
        ).model_dump(mode="json")

        response = await async_client.post("/xyzen/api/v1/providers/", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test API Provider"
        assert data["id"] is not None
        assert data["key"] == "sk-test-key"

    async def test_get_my_providers(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/me"""
        # Create a provider first
        payload = ProviderCreateFactory.build(
            scope=ProviderScope.USER, provider_type=ProviderType.GOOGLE, name="My Google Provider"
        ).model_dump(mode="json")
        c_response = await async_client.post("/xyzen/api/v1/providers/", json=payload)
        assert c_response.status_code == 201

        # List providers
        response = await async_client.get("/xyzen/api/v1/providers/me")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should find our new provider
        found = any(p["name"] == "My Google Provider" for p in data)
        assert found

    async def test_get_provider_detail(self, async_client: AsyncClient):
        """Test GET /api/v1/providers/{id}"""
        # Create
        payload = ProviderCreateFactory.build(scope=ProviderScope.USER, provider_type=ProviderType.OPENAI).model_dump(
            mode="json"
        )

        c_response = await async_client.post("/xyzen/api/v1/providers/", json=payload)
        provider_id = c_response.json()["id"]

        # Get
        response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == provider_id
        assert data["key"] == payload["key"]

    async def test_delete_provider_endpoint(self, async_client: AsyncClient):
        """Test DELETE /api/v1/providers/{id}"""
        # Create
        payload = ProviderCreateFactory.build(scope=ProviderScope.USER, provider_type=ProviderType.OPENAI).model_dump(
            mode="json"
        )

        c_response = await async_client.post("/xyzen/api/v1/providers/", json=payload)
        provider_id = c_response.json()["id"]

        # Delete
        response = await async_client.delete(f"/xyzen/api/v1/providers/{provider_id}")
        assert response.status_code == 204

        # Verify deletion
        get_response = await async_client.get(f"/xyzen/api/v1/providers/{provider_id}")
        assert get_response.status_code == 404
