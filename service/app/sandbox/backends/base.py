"""
Base Sandbox Backend

Abstract base class for sandbox execution backends.
"""

from abc import ABC, abstractmethod
from typing import Any

from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.result import SandboxResult


class BaseSandboxBackend(ABC):
    """Abstract base class for sandbox backends."""

    def __init__(
        self,
        limits: ResourceLimits | None = None,
        env_vars: dict[str, str] | None = None,
        allowed_paths: list[str] | None = None,
    ) -> None:
        """
        Initialize the sandbox backend.

        Args:
            limits: Resource limits for execution
            env_vars: Environment variables to set
            allowed_paths: Allowed filesystem paths
        """
        self.limits = limits or ResourceLimits.default()
        self.env_vars = env_vars or {}
        self.allowed_paths = allowed_paths or ["/tmp"]

    @abstractmethod
    async def execute(
        self,
        code: str,
        language: str = "python",
        stdin: str = "",
        **kwargs: Any,
    ) -> SandboxResult:
        """
        Execute code in the sandbox.

        Args:
            code: The code to execute
            language: Programming language (python, javascript, etc.)
            stdin: Standard input to provide
            **kwargs: Additional backend-specific options

        Returns:
            SandboxResult with execution output and metrics
        """
        pass

    @abstractmethod
    async def execute_file(
        self,
        file_path: str,
        stdin: str = "",
        **kwargs: Any,
    ) -> SandboxResult:
        """
        Execute a file in the sandbox.

        Args:
            file_path: Path to the file to execute
            stdin: Standard input to provide
            **kwargs: Additional backend-specific options

        Returns:
            SandboxResult with execution output and metrics
        """
        pass

    def validate_path(self, path: str) -> bool:
        """
        Validate that a path is allowed for access.

        Args:
            path: The path to validate

        Returns:
            True if path is allowed, False otherwise
        """
        for allowed in self.allowed_paths:
            if path.startswith(allowed):
                return True
        return False

    def with_limits(self, limits: ResourceLimits) -> "BaseSandboxBackend":
        """Set resource limits and return self for chaining."""
        self.limits = limits
        return self

    def with_env(self, key: str, value: str) -> "BaseSandboxBackend":
        """Add environment variable and return self for chaining."""
        self.env_vars[key] = value
        return self

    def allow_path(self, path: str) -> "BaseSandboxBackend":
        """Add allowed path and return self for chaining."""
        if path not in self.allowed_paths:
            self.allowed_paths.append(path)
        return self

    @abstractmethod
    async def cleanup(self) -> None:
        """Clean up any resources used by the backend."""
        pass

    async def __aenter__(self) -> "BaseSandboxBackend":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.cleanup()

