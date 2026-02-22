"""
Sandbox backend factory.

Provides a registry of backend providers and a factory function
that returns the configured implementation. To add a new backend:

1. Implement SandboxBackend in a new module (e.g. ``e2b_backend.py``)
2. Register it in ``_BACKEND_REGISTRY`` below
"""

from __future__ import annotations

import logging
from typing import Callable

from .base import SandboxBackend

logger = logging.getLogger(__name__)

# Maps config name → lazy import callable that returns a SandboxBackend.
# Using callables avoids importing heavy SDKs at module-load time.
_BACKEND_REGISTRY: dict[str, Callable[[], SandboxBackend]] = {}


def _register_defaults() -> None:
    """Register the shipped backend providers."""

    def _daytona() -> SandboxBackend:
        from .daytona_backend import DaytonaBackend

        return DaytonaBackend()

    def _e2b() -> SandboxBackend:
        from .e2b_backend import E2BBackend

        return E2BBackend()

    _BACKEND_REGISTRY["daytona"] = _daytona
    _BACKEND_REGISTRY["e2b"] = _e2b


_register_defaults()


def register_backend(name: str, factory: Callable[[], SandboxBackend]) -> None:
    """Register a custom sandbox backend at runtime.

    Useful for plugins or test doubles.
    """
    _BACKEND_REGISTRY[name.lower()] = factory


def get_backend() -> SandboxBackend:
    """Return the configured sandbox backend instance.

    The backend is determined by ``configs.Sandbox.Backend``.
    """
    from app.configs import configs

    backend_name = configs.Sandbox.Backend.lower()
    factory = _BACKEND_REGISTRY.get(backend_name)

    if factory is None:
        available = ", ".join(sorted(_BACKEND_REGISTRY.keys()))
        raise ValueError(f"Unknown sandbox backend: {backend_name!r}. Available backends: {available}")

    return factory()


__all__ = ["get_backend", "register_backend"]
