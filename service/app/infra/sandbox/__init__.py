"""
Sandbox infrastructure module.

Provides isolated code execution environments via pluggable backends.
"""

from __future__ import annotations

from .backends import get_backend
from .manager import SandboxManager


def get_sandbox_manager(session_id: str) -> SandboxManager:
    """
    Get a SandboxManager for a given session.

    Args:
        session_id: Session UUID string

    Returns:
        SandboxManager instance with configured backend
    """
    backend = get_backend()
    return SandboxManager(backend=backend, session_id=session_id)


__all__ = ["get_sandbox_manager", "SandboxManager"]
