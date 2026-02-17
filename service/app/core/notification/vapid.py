"""VAPID key validation and Web Push sending via pywebpush."""

from __future__ import annotations

import json
import logging

from app.configs import configs

logger = logging.getLogger(__name__)


def ensure_vapid_keys() -> bool:
    """Validate that the VAPID key pair is configured.

    The default config ships a dev key pair, so this should always pass
    unless someone explicitly blanked one of the fields.

    Returns True when a valid key pair is available.
    """
    novu = configs.Novu

    if novu.VapidPublicKey and novu.VapidPrivateKey:
        logger.info("VAPID keys ready (public=%s…)", novu.VapidPublicKey[:20])
        return True

    logger.warning("VAPID keys not configured — Web Push disabled")
    return False


def send_push(subscription_info: dict[str, str | bytes | dict[str, str | bytes]], payload: dict[str, str]) -> bool:
    """Send a single Web Push message.

    *subscription_info* must contain ``endpoint``, ``keys.p256dh``, ``keys.auth``.
    Returns True on success, raises :class:`WebPushException` on failure.
    """
    from pywebpush import WebPushException, webpush

    novu = configs.Novu

    if not novu.VapidPrivateKey or not novu.VapidPublicKey:
        logger.debug("VAPID keys not configured — skipping push")
        return False

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=novu.VapidPrivateKey,
            vapid_claims={"sub": f"mailto:{novu.VapidContactEmail}"},
        )
        return True
    except WebPushException as e:
        # Re-raise so callers can inspect the response code (e.g. 410 Gone)
        raise e
