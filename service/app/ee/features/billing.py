"""EE billing API wrappers."""

from typing import Any
from uuid import UUID

from app.ee.client import ee_request


async def ee_settle(
    user_id: str,
    amount: int,
    session_id: UUID | None = None,
    topic_id: UUID | None = None,
    message_id: UUID | None = None,
    description: str | None = None,
) -> dict[str, Any] | None:
    """Settle the final billing amount with the remote EE billing service."""
    return await ee_request(
        "POST",
        "/v1/billing/settle",
        json={
            "user_id": user_id,
            "amount": amount,
            "session_id": str(session_id) if session_id else None,
            "topic_id": str(topic_id) if topic_id else None,
            "message_id": str(message_id) if message_id else None,
            "description": description,
        },
    )
