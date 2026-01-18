"""
Sandbox Executor

Main entry point for sandbox code execution.
Provides a unified interface for different sandbox backends.
"""

import hashlib
import logging
import time
from typing import Any

from app.configs import configs
from app.sandbox.backends.base import BaseSandboxBackend
from app.sandbox.backends.container_backend import ContainerBackend
from app.sandbox.backends.subprocess_backend import SubprocessBackend
from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.result import SandboxResult

logger = logging.getLogger(__name__)


class ExecutionCache:
    """Simple in-memory cache for execution results."""

    def __init__(self, ttl_secs: int = 300) -> None:
        self._cache: dict[str, tuple[SandboxResult, float]] = {}
        self._ttl = ttl_secs

    def _make_key(self, code: str, language: str, stdin: str) -> str:
        """Generate cache key from execution parameters."""
        content = f"{language}:{code}:{stdin}"
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, code: str, language: str, stdin: str) -> SandboxResult | None:
        """Get cached result if available and not expired."""
        key = self._make_key(code, language, stdin)
        if key in self._cache:
            result, timestamp = self._cache[key]
            if time.time() - timestamp < self._ttl:
                logger.debug(f"Cache hit for execution: {key[:16]}...")
                return result
            else:
                del self._cache[key]
        return None

    def set(self, code: str, language: str, stdin: str, result: SandboxResult) -> None:
        """Cache execution result."""
        key = self._make_key(code, language, stdin)
        self._cache[key] = (result, time.time())
        logger.debug(f"Cached execution result: {key[:16]}...")

    def clear(self) -> None:
        """Clear all cached results."""
        self._cache.clear()

    def sweep(self) -> int:
        """Remove expired entries and return count of removed items."""
        now = time.time()
        expired = [k for k, (_, ts) in self._cache.items() if now - ts >= self._ttl]
        for key in expired:
            del self._cache[key]
        return len(expired)


# Global cache instance
_execution_cache: ExecutionCache | None = None


def get_execution_cache() -> ExecutionCache:
    """Get or create the global execution cache."""
    global _execution_cache
    if _execution_cache is None:
        sandbox_config = getattr(configs, "Sandbox", None)
        ttl = sandbox_config.cache_ttl_secs if sandbox_config else 300
        _execution_cache = ExecutionCache(ttl_secs=ttl)
    return _execution_cache


class SandboxExecutor:
    """
    Main sandbox executor that provides a unified interface for code execution.

    Supports multiple backends:
    - subprocess: Local process with rlimit (Linux)
    - docker: Docker container isolation
    - kubernetes: Kubernetes pod isolation
    """

    def __init__(
        self,
        backend: str | None = None,
        limits: ResourceLimits | None = None,
        env_vars: dict[str, str] | None = None,
        allowed_paths: list[str] | None = None,
        enable_cache: bool = True,
        libraries: list[str] | None = None,
    ) -> None:
        """
        Initialize the sandbox executor.

        Args:
            backend: Backend type (subprocess, docker, kubernetes)
            limits: Resource limits for execution
            env_vars: Environment variables to set
            allowed_paths: Allowed filesystem paths
            enable_cache: Whether to cache execution results
            libraries: Libraries to install (for container backends)
        """
        sandbox_config = getattr(configs, "Sandbox", None)
        self.backend_type = backend or (
            sandbox_config.default_backend if sandbox_config else "subprocess"
        )
        self.limits = limits or ResourceLimits.from_config()
        self.env_vars = env_vars or {}
        self.allowed_paths = allowed_paths or ["/tmp"]
        self.enable_cache = enable_cache
        self.libraries = libraries or []

        self._backend: BaseSandboxBackend | None = None

    def _create_backend(self) -> BaseSandboxBackend:
        """Create the appropriate backend based on configuration."""
        if self.backend_type in ("docker", "kubernetes", "k8s"):
            return ContainerBackend(
                limits=self.limits,
                env_vars=self.env_vars,
                allowed_paths=self.allowed_paths,
                backend=self.backend_type,
                libraries=self.libraries,
            )
        else:
            return SubprocessBackend(
                limits=self.limits,
                env_vars=self.env_vars,
                allowed_paths=self.allowed_paths,
            )

    @property
    def backend(self) -> BaseSandboxBackend:
        """Get or create the backend."""
        if self._backend is None:
            self._backend = self._create_backend()
        return self._backend

    async def execute(
        self,
        code: str,
        language: str = "python",
        stdin: str = "",
        use_cache: bool | None = None,
        **kwargs: Any,
    ) -> SandboxResult:
        """
        Execute code in the sandbox.

        Args:
            code: The code to execute
            language: Programming language
            stdin: Standard input
            use_cache: Override cache setting for this execution
            **kwargs: Additional backend-specific options

        Returns:
            SandboxResult with execution output and metrics
        """
        should_cache = use_cache if use_cache is not None else self.enable_cache

        # Check cache
        if should_cache:
            cache = get_execution_cache()
            cached = cache.get(code, language, stdin)
            if cached is not None:
                return cached

        # Execute
        logger.info(f"Executing {language} code with {self.backend_type} backend")
        result = await self.backend.execute(code, language, stdin, **kwargs)

        # Cache successful results
        if should_cache and result.success:
            cache = get_execution_cache()
            cache.set(code, language, stdin, result)

        return result

    async def execute_file(
        self,
        file_path: str,
        stdin: str = "",
        language: str = "python",
        **kwargs: Any,
    ) -> SandboxResult:
        """
        Execute a file in the sandbox.

        Args:
            file_path: Path to the file to execute
            stdin: Standard input
            language: Programming language
            **kwargs: Additional backend-specific options

        Returns:
            SandboxResult with execution output and metrics
        """
        logger.info(f"Executing file {file_path} with {self.backend_type} backend")
        return await self.backend.execute_file(file_path, stdin, language=language, **kwargs)

    async def execute_python(
        self,
        code: str,
        stdin: str = "",
        **kwargs: Any,
    ) -> SandboxResult:
        """Convenience method for executing Python code."""
        return await self.execute(code, language="python", stdin=stdin, **kwargs)

    async def execute_with_function(
        self,
        code: str,
        function_name: str,
        args: tuple[Any, ...] = (),
        kwargs_dict: dict[str, Any] | None = None,
        language: str = "python",
    ) -> SandboxResult:
        """
        Execute code and call a specific function with arguments.

        Args:
            code: The code containing the function
            function_name: Name of the function to call
            args: Positional arguments for the function
            kwargs_dict: Keyword arguments for the function
            language: Programming language

        Returns:
            SandboxResult with function return value in output
        """
        kwargs_dict = kwargs_dict or {}

        # Build execution wrapper
        wrapper_code = f"""
{code}

import json
import traceback

def _serialize_result(obj):
    try:
        json.dumps(obj, ensure_ascii=False)
        return obj
    except (TypeError, ValueError):
        return str(obj)

try:
    result = {function_name}(*{args!r}, **{kwargs_dict!r})
    serialized = _serialize_result(result)
    print(json.dumps({{"success": True, "result": serialized}}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({{"success": False, "error": str(e), "traceback": traceback.format_exc()}}, ensure_ascii=False))
"""
        return await self.execute(wrapper_code, language=language, use_cache=False)

    def with_limits(self, limits: ResourceLimits) -> "SandboxExecutor":
        """Set resource limits and return self for chaining."""
        self.limits = limits
        if self._backend:
            self._backend.limits = limits
        return self

    def with_env(self, key: str, value: str) -> "SandboxExecutor":
        """Add environment variable and return self for chaining."""
        self.env_vars[key] = value
        if self._backend:
            self._backend.env_vars[key] = value
        return self

    def add_library(self, library: str) -> "SandboxExecutor":
        """Add a library to install (for container backends)."""
        if library not in self.libraries:
            self.libraries.append(library)
        return self

    async def cleanup(self) -> None:
        """Clean up backend resources."""
        if self._backend:
            await self._backend.cleanup()

    async def __aenter__(self) -> "SandboxExecutor":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.cleanup()


# Convenience function for quick execution
async def execute_code(
    code: str,
    language: str = "python",
    stdin: str = "",
    backend: str | None = None,
    **kwargs: Any,
) -> SandboxResult:
    """
    Execute code in a sandbox with default settings.

    Args:
        code: The code to execute
        language: Programming language
        stdin: Standard input
        backend: Backend type (subprocess, docker, kubernetes)
        **kwargs: Additional options

    Returns:
        SandboxResult with execution output and metrics
    """
    async with SandboxExecutor(backend=backend) as executor:
        return await executor.execute(code, language, stdin, **kwargs)
