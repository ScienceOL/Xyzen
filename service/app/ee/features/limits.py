"""EE limits API wrappers."""

from typing import Any

from app.ee.client import ee_request


async def ee_check_chat_limit(user_id: str, connection_id: str) -> dict[str, Any] | None:
    """Check whether the user is allowed to send a chat message."""
    return await ee_request(
        "POST",
        "/v1/limits/check-chat",
        json={"user_id": user_id, "connection_id": connection_id},
    )


async def ee_track_connect(user_id: str, connection_id: str) -> dict[str, Any] | None:
    """Notify the EE API that a chat connection has been established."""
    return await ee_request(
        "POST",
        "/v1/limits/track-connect",
        json={"user_id": user_id, "connection_id": connection_id},
    )


async def ee_track_disconnect(user_id: str, connection_id: str) -> dict[str, Any] | None:
    """Notify the EE API that a chat connection has been closed."""
    return await ee_request(
        "POST",
        "/v1/limits/track-disconnect",
        json={"user_id": user_id, "connection_id": connection_id},
    )
