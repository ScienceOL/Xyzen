"""
Sandbox infrastructure module.

Provides isolated code execution environments via pluggable backends.
"""

from __future__ import annotations

from .backends import get_backend
from .manager import SandboxInfo, SandboxManager, scan_all_sandbox_infos


def get_sandbox_manager(session_id: str, user_id: str | None = None) -> SandboxManager:
    """
    Get a SandboxManager for a given session.

    Args:
        session_id: Session UUID string
        user_id: Optional user ID for limit enforcement

    Returns:
        SandboxManager instance with configured backend
    """
    backend = get_backend()
    return SandboxManager(backend=backend, session_id=session_id, user_id=user_id)


__all__ = ["SandboxInfo", "SandboxManager", "get_sandbox_manager", "scan_all_sandbox_infos"]
