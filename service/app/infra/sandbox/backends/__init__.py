"""
Sandbox backend factory.

Returns the configured backend implementation.
"""

from __future__ import annotations

from .base import SandboxBackend


def get_backend() -> SandboxBackend:
    """
    Get the configured sandbox backend.

    Returns:
        SandboxBackend instance based on app config
    """
    from app.configs import configs

    backend_name = configs.Sandbox.Backend.lower()

    if backend_name == "daytona":
        from .daytona_backend import DaytonaBackend

        return DaytonaBackend()
    else:
        raise ValueError(f"Unknown sandbox backend: {backend_name}")


__all__ = ["get_backend"]
