"""Celery tasks for sending Novu notifications and Web Push."""

import asyncio
import logging
from typing import Any

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="send_notification", ignore_result=True, soft_time_limit=30)
def send_notification(
    event_type: str,
    subscriber_id: str,
    payload: dict[str, Any],
    actor: dict[str, str] | None = None,
) -> None:
    """Send a notification to a single subscriber via Novu (sync wrapper)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_send_notification_async(event_type, subscriber_id, payload, actor))
    finally:
        loop.close()


async def _send_notification_async(
    event_type: str,
    subscriber_id: str,
    payload: dict[str, Any],
    actor: dict[str, str] | None = None,
) -> None:
    from app.core.notification.service import NotificationService

    svc = NotificationService()
    svc.trigger(event_type, subscriber_id, payload, actor=actor)


@celery_app.task(name="broadcast_notification", ignore_result=True, soft_time_limit=30)
def broadcast_notification(
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Broadcast a notification to all subscribers via Novu (sync wrapper)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_broadcast_notification_async(event_type, payload))
    finally:
        loop.close()


async def _broadcast_notification_async(
    event_type: str,
    payload: dict[str, Any],
) -> None:
    from app.core.notification.service import NotificationService

    svc = NotificationService()
    svc.broadcast(event_type, payload)


@celery_app.task(name="send_web_push", ignore_result=True, soft_time_limit=30)
def send_web_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "",
    icon: str = "/icon.png",
) -> None:
    """Send Web Push to all of a user's subscriptions via pywebpush."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_send_web_push_async(user_id, title, body, url, icon))
    finally:
        loop.close()


async def _send_web_push_async(
    user_id: str,
    title: str,
    body: str,
    url: str,
    icon: str,
) -> None:
    from pywebpush import WebPushException

    from app.configs import configs
    from app.core.notification.vapid import send_push
    from app.infra.database.connection import get_task_db_session
    from app.repos.push_subscription import PushSubscriptionRepository

    if not configs.Novu.VapidPublicKey:
        return

    async with get_task_db_session() as db:
        repo = PushSubscriptionRepository(db)
        subs = await repo.get_by_user_id(user_id)

        payload = {"title": title, "body": body, "url": url, "icon": icon}

        for sub in subs:
            subscription_info: dict[str, str | bytes | dict[str, str | bytes]] = {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
            }
            try:
                send_push(subscription_info, payload)
            except WebPushException as e:
                # 410 Gone → subscription expired, remove it
                response = getattr(e, "response", None)
                if response is not None and response.status_code == 410:
                    logger.info("Push subscription expired (410), removing: %s", sub.endpoint[:60])
                    await repo.delete_by_endpoint(sub.endpoint)
                    await db.commit()
                else:
                    logger.warning("Web push failed for %s: %s", sub.endpoint[:60], e)
            except Exception:
                logger.exception("Unexpected error sending web push to %s", sub.endpoint[:60])
