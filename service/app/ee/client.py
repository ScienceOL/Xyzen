"""HTTP client for the remote EE API service."""

import logging
from typing import Any

import httpx

from app.configs import configs

logger = logging.getLogger(__name__)


async def ee_request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Send a request to the remote EE API.

    Returns the parsed JSON response on success, or ``None`` on any failure
    so that callers can fall back to CE behaviour.
    """
    base_url = configs.EE.ApiUrl.rstrip("/")
    url = f"{base_url}{path}"
    headers = {"Authorization": f"Bearer {configs.EE.LicenseKey}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request(
                method,
                url,
                json=json,
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.warning(f"EE API request failed ({method} {path}): {e}")
        return None
