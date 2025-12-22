"""Tests for new auth config endpoint."""

from httpx import AsyncClient


async def test_get_auth_config(async_client: AsyncClient):
    """Verify /auth/config returns provider metadata."""
    response = await async_client.get("/xyzen/api/v1/auth/config")
    assert response.status_code == 200
    data = response.json()
    assert "provider" in data
    # issuer may be empty depending on provider but key should exist (nullable)
    assert "issuer" in data
    assert "audience" in data
    assert "algorithm" in data


async def test_get_auth_status(async_client: AsyncClient):
    """Sanity check existing status endpoint still works."""
    response = await async_client.get("/xyzen/api/v1/auth/status")
    assert response.status_code == 200
    data = response.json()
    assert data["is_configured"] is True
    assert data["provider"] in {"casdoor", "bohrium", "bohr_app"}
