"""User event broadcaster via Redis pub/sub.

Publishes per-user events to Redis channels so that any API pod
with an active WebSocket for that user can forward the event.
"""

import json
import logging

from app.models.redemption import UserWallet

logger = logging.getLogger(__name__)


async def broadcast_user_event(user_id: str, event_type: str, data: dict) -> None:
    """Publish an event to the per-user Redis channel.

    Args:
        user_id: Target user.
        event_type: Event name, e.g. "credit_updated".
        data: JSON-serialisable payload.
    """
    try:
        from app.infra.redis import get_redis_client

        redis = await get_redis_client()
        channel = f"user:{user_id}:events"
        message = json.dumps({"type": event_type, "data": data}, default=str)
        await redis.publish(channel, message)
        logger.debug(f"Published {event_type} to {channel}")
    except Exception:
        logger.warning(f"Failed to publish user event {event_type} for {user_id}", exc_info=True)


async def broadcast_wallet_update(wallet: UserWallet) -> None:
    """Convenience wrapper that broadcasts the current wallet state."""
    await broadcast_user_event(
        wallet.user_id,
        "credit_updated",
        {
            "virtual_balance": wallet.virtual_balance,
            "free_balance": wallet.free_balance,
            "paid_balance": wallet.paid_balance,
            "earned_balance": wallet.earned_balance,
            "total_credited": wallet.total_credited,
            "total_consumed": wallet.total_consumed,
        },
    )
