"""Celery tasks for sending Novu notifications."""

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
) -> None:
    """Send a notification to a single subscriber via Novu (sync wrapper)."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_send_notification_async(event_type, subscriber_id, payload))
    finally:
        loop.close()


async def _send_notification_async(
    event_type: str,
    subscriber_id: str,
    payload: dict[str, Any],
) -> None:
    from app.core.notification.service import NotificationService

    svc = NotificationService()
    svc.trigger(event_type, subscriber_id, payload)


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
