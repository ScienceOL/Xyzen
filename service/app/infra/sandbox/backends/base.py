"""
Abstract sandbox backend protocol and shared data classes.

Defines the interface that all sandbox backends must implement.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


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
    ) -> str:
        """
        Create a new sandbox instance.

        Args:
            name: Unique sandbox name
            language: Programming language environment
            env_vars: Environment variables to set

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


__all__ = [
    "ExecResult",
    "FileInfo",
    "SearchMatch",
    "SandboxBackend",
]
