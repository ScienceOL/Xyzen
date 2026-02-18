"""EE subscription API wrappers."""

from typing import Any

from app.ee.client import ee_request


async def ee_get_user_limits(user_id: str) -> dict[str, Any] | None:
    """Fetch the user's subscription limits from the remote EE API."""
    return await ee_request("GET", f"/v1/subscription/limits/{user_id}")


async def ee_get_user_role(user_id: str) -> dict[str, Any] | None:
    """Fetch the user's subscription role from the remote EE API."""
    return await ee_request("GET", f"/v1/subscription/role/{user_id}")
