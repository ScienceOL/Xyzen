"""Notification service — subscriber lifecycle, device tokens, trigger/broadcast."""

from __future__ import annotations

import logging
from typing import Any

from app.core.notification.client import NovuClient
from app.core.notification.events import NotificationEventType

logger = logging.getLogger(__name__)


class NotificationService:
    """High-level notification operations.

    Every public method returns ``False`` silently when Novu is disabled so
    callers never need to guard on config.
    """

    # --- Subscriber lifecycle ---------------------------------------------------

    def ensure_subscriber(self, user_id: str, email: str | None = None, name: str | None = None) -> bool:
        """Create or update a Novu subscriber for *user_id*.

        Called after successful login validation (fire-and-forget).
        """
        client = NovuClient.get()
        if client is None:
            return False

        try:
            first_name = name or ""
            client.subscribers.create(
                create_subscriber_request_dto={
                    "subscriber_id": user_id,
                    "first_name": first_name,
                    "email": email or "",
                },
                fail_if_exists=False,
            )
            logger.debug("Novu subscriber ensured: %s", user_id)
            return True
        except Exception:
            logger.exception("Failed to ensure Novu subscriber %s", user_id)
            return False

    # --- Device token CRUD ------------------------------------------------------

    def set_device_token(self, subscriber_id: str, token: str, provider_id: str = "fcm") -> bool:
        """Register a push device token (FCM) for *subscriber_id*."""
        client = NovuClient.get()
        if client is None:
            return False

        try:
            client.subscribers.credentials.update(
                subscriber_id=subscriber_id,
                update_subscriber_channel_request_dto={
                    "provider_id": provider_id,
                    "credentials": {"device_tokens": [token]},
                },
            )
            logger.debug("Device token set for subscriber %s", subscriber_id)
            return True
        except Exception:
            logger.exception("Failed to set device token for %s", subscriber_id)
            return False

    def remove_device_token(self, subscriber_id: str, token: str, provider_id: str = "fcm") -> bool:
        """Remove a push device token for *subscriber_id*."""
        client = NovuClient.get()
        if client is None:
            return False

        try:
            client.subscribers.credentials.update(
                subscriber_id=subscriber_id,
                update_subscriber_channel_request_dto={
                    "provider_id": provider_id,
                    "credentials": {"device_tokens": []},
                },
            )
            logger.debug("Device token removed for subscriber %s", subscriber_id)
            return True
        except Exception:
            logger.exception("Failed to remove device token for %s", subscriber_id)
            return False

    # --- Trigger ----------------------------------------------------------------

    def trigger(
        self,
        event_type: NotificationEventType | str,
        subscriber_id: str,
        payload: dict[str, Any],
        actor: dict[str, str] | None = None,
    ) -> bool:
        """Trigger a notification workflow for a single subscriber."""
        client = NovuClient.get()
        if client is None:
            return False

        try:
            dto: dict[str, Any] = {
                "workflow_id": str(event_type),
                "to": subscriber_id,
                "payload": payload,
            }
            if actor:
                dto["actor"] = actor

            logger.debug(
                "[Notification] trigger: event=%s, subscriber=%s, payload_keys=%s",
                event_type,
                subscriber_id,
                list(payload.keys()),
            )
            client.trigger(trigger_event_request_dto=dto)
            logger.debug("Notification triggered: %s → %s", event_type, subscriber_id)
            return True
        except Exception:
            logger.exception("Failed to trigger notification %s → %s", event_type, subscriber_id)
            return False

    def broadcast(self, event_type: NotificationEventType | str, payload: dict[str, Any]) -> bool:
        """Trigger a broadcast notification to all subscribers."""
        client = NovuClient.get()
        if client is None:
            return False

        try:
            client.trigger_broadcast(
                trigger_event_to_all_request_dto={
                    "workflow_id": str(event_type),
                    "payload": payload,
                },
            )
            logger.debug("Broadcast notification triggered: %s", event_type)
            return True
        except Exception:
            logger.exception("Failed to broadcast notification %s", event_type)
            return False
