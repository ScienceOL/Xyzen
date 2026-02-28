"""Settler — persistent deployment layer.

Factory function to obtain a configured SettlerService instance.
"""

from __future__ import annotations

from app.configs import configs

from .daytona_provider import DaytonaSettlerProvider
from .service import SettlerService


def get_settler_service() -> SettlerService:
    """Return a SettlerService instance.

    Raises RuntimeError if the Settler feature is disabled.
    """
    if not configs.Settler.Enable:
        raise RuntimeError("Settler service is disabled (set XYZEN_SETTLER_Enable=true to enable)")
    return SettlerService(DaytonaSettlerProvider())


__all__ = ["get_settler_service", "SettlerService", "DaytonaSettlerProvider"]
