"""Singleton Novu SDK client wrapper. No-op when Novu is disabled."""

from __future__ import annotations

import logging
from typing import Any

from app.configs import configs

logger = logging.getLogger(__name__)

_client_instance: Any | None = None
_init_attempted: bool = False


def _get_client() -> Any | None:
    """Lazily initialise and return the Novu SDK client (singleton).

    Returns ``None`` when Novu is disabled or the secret key is empty.
    """
    global _client_instance, _init_attempted

    if _init_attempted:
        return _client_instance

    _init_attempted = True

    if not configs.Novu.Enable or not configs.Novu.SecretKey:
        logger.info("Novu is disabled or secret key is empty – notification client will no-op")
        return None

    try:
        from novu_py import Novu

        _client_instance = Novu(
            secret_key=configs.Novu.SecretKey,
            server_url=configs.Novu.ApiUrl,
        )
        logger.info("Novu client initialised (api_url=%s)", configs.Novu.ApiUrl)
    except Exception:
        logger.exception("Failed to initialise Novu client")
        _client_instance = None

    return _client_instance


class NovuClient:
    """Thin wrapper providing a safe ``get()`` accessor."""

    @staticmethod
    def get() -> Any | None:
        """Return the Novu SDK client or ``None``."""
        return _get_client()

    @staticmethod
    def is_available() -> bool:
        return _get_client() is not None
