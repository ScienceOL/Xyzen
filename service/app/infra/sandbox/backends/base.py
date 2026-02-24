"""
Abstract sandbox backend protocol and shared data classes.

Defines the interface that all sandbox backends must implement.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SandboxStatus(str, Enum):
    """Backend-reported sandbox lifecycle status."""

    running = "running"
    stopped = "stopped"
    unknown = "unknown"


@dataclass
class SandboxState:
    """Snapshot of a sandbox's lifecycle state."""

    status: SandboxStatus = SandboxStatus.unknown
    remaining_seconds: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResolvedSandboxConfig:
    """Fully resolved sandbox configuration (global defaults + user overrides).

    Produced by ``SandboxConfigResolver`` and consumed by backends at
    sandbox creation time.
    """

    cpu: int
    memory: int  # GiB
    disk: int  # GiB
    auto_stop_minutes: int
    auto_delete_minutes: int
    timeout: int  # command execution timeout in seconds
    image: str  # docker image


@dataclass
class PreviewUrl:
    """Preview URL for a sandbox port."""

    url: str
    token: str
    port: int


@dataclass
class ExecResult:
    """Result of executing a command in a sandbox."""

    exit_code: int
    stdout: str
    stderr: str


@dataclass
class FileInfo:
    """Information about a file in a sandbox."""

    name: str
    path: str
    is_dir: bool
    size: int | None = None


@dataclass
class SearchMatch:
    """A grep match result."""

    file: str
    line: int
    content: str


class SandboxBackend(ABC):
    """Abstract interface for sandbox execution backends."""

    @abstractmethod
    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
        config: ResolvedSandboxConfig | None = None,
    ) -> str:
        """
        Create a new sandbox instance.

        Args:
            name: Unique sandbox name
            language: Programming language environment
            env_vars: Environment variables to set
            config: Resolved per-user config (falls back to global if None)

        Returns:
            Backend-specific sandbox ID
        """
        ...

    @abstractmethod
    async def delete_sandbox(self, sandbox_id: str) -> None:
        """Delete a sandbox instance."""
        ...

    @abstractmethod
    async def exec(
        self,
        sandbox_id: str,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
    ) -> ExecResult:
        """
        Execute a shell command in the sandbox.

        Args:
            sandbox_id: Backend sandbox ID
            command: Shell command to execute
            cwd: Working directory (optional)
            timeout: Timeout in seconds (optional)

        Returns:
            ExecResult with exit_code, stdout, stderr
        """
        ...

    @abstractmethod
    async def read_file(self, sandbox_id: str, path: str) -> str:
        """Read file content from the sandbox."""
        ...

    @abstractmethod
    async def read_file_bytes(self, sandbox_id: str, path: str) -> bytes:
        """Read raw file bytes from the sandbox."""
        ...

    @abstractmethod
    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        """Write content to a file in the sandbox."""
        ...

    @abstractmethod
    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        """List files in a directory."""
        ...

    @abstractmethod
    async def find_files(self, sandbox_id: str, root: str, pattern: str) -> list[str]:
        """Find files matching a glob pattern."""
        ...

    @abstractmethod
    async def search_in_files(
        self,
        sandbox_id: str,
        root: str,
        pattern: str,
        include: str | None = None,
    ) -> list[SearchMatch]:
        """Search file contents using a regex/string pattern."""
        ...

    @abstractmethod
    async def write_file_bytes(self, sandbox_id: str, path: str, data: bytes) -> None:
        """Write raw bytes to a file in the sandbox."""
        ...

    @abstractmethod
    async def get_preview_url(self, sandbox_id: str, port: int) -> PreviewUrl:
        """Get a browser-accessible preview URL for a sandbox port."""
        ...

    # --- Lifecycle methods (default implementations — optional for backends) ---

    async def get_status(self, sandbox_id: str) -> SandboxState:
        """Query the backend for the sandbox's current lifecycle state.

        Default: returns ``unknown`` status. Override to provide real data.
        """
        return SandboxState(status=SandboxStatus.unknown)

    async def keep_alive(self, sandbox_id: str) -> None:
        """Refresh the sandbox's idle timer on the backend.

        Default: no-op. Override to extend timeout.
        """

    async def start(self, sandbox_id: str) -> None:
        """Resume a stopped sandbox.

        Default: raises ``NotImplementedError`` (not all backends support resume).
        """
        raise NotImplementedError(f"{type(self).__name__} does not support starting stopped sandboxes")

    async def get_info(self, sandbox_id: str) -> dict[str, Any]:
        """Return backend-specific diagnostic information.

        Default: empty dict.
        """
        return {}


__all__ = [
    "PreviewUrl",
    "ExecResult",
    "FileInfo",
    "ResolvedSandboxConfig",
    "SearchMatch",
    "SandboxBackend",
    "SandboxState",
    "SandboxStatus",
]
