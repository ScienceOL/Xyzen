"""
Subprocess Sandbox Backend

Executes code in a subprocess with resource limits.
Uses Linux rlimit for resource control on supported platforms.
"""

import asyncio
import logging
import os
import platform
import sys
import tempfile
import time
from typing import Any

from app.sandbox.backends.base import BaseSandboxBackend
from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.result import SandboxResult

logger = logging.getLogger(__name__)


class SubprocessBackend(BaseSandboxBackend):
    """Subprocess-based sandbox backend with resource limits."""

    LANGUAGE_COMMANDS: dict[str, list[str]] = {
        "python": [sys.executable, "-u"],
        "python3": [sys.executable, "-u"],
        "node": ["node"],
        "javascript": ["node"],
        "bash": ["bash"],
        "sh": ["sh"],
    }

    def __init__(
        self,
        limits: ResourceLimits | None = None,
        env_vars: dict[str, str] | None = None,
        allowed_paths: list[str] | None = None,
    ) -> None:
        super().__init__(limits, env_vars, allowed_paths)
        self._temp_files: list[str] = []

    async def execute(
        self,
        code: str,
        language: str = "python",
        stdin: str = "",
        **kwargs: Any,
    ) -> SandboxResult:
        """Execute code in a subprocess with resource limits."""
        logger.info(f"Executing {language} code in subprocess sandbox")
        start_time = time.time()

        # Create temporary file for code
        suffix = self._get_file_suffix(language)
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=suffix,
            delete=False,
            encoding="utf-8",
        ) as f:
            f.write(code)
            temp_file = f.name
            self._temp_files.append(temp_file)

        try:
            result = await self.execute_file(temp_file, stdin, language=language, **kwargs)
            result.duration_ms = int((time.time() - start_time) * 1000)
            return result
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_file)
                self._temp_files.remove(temp_file)
            except OSError:
                pass

    async def execute_file(
        self,
        file_path: str,
        stdin: str = "",
        language: str = "python",
        **kwargs: Any,
    ) -> SandboxResult:
        """Execute a file in a subprocess with resource limits."""
        logger.info(f"Executing file in subprocess sandbox: {file_path}")
        start_time = time.time()

        # Get command for language
        cmd = self._get_command(language, file_path)
        if not cmd:
            return SandboxResult.from_error(f"Unsupported language: {language}")

        # Build environment
        env = self._build_env()

        # Create process with resource limits
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                preexec_fn=self._apply_rlimits if platform.system() == "Linux" else None,
            )
        except Exception as e:
            logger.error(f"Failed to create subprocess: {e}")
            return SandboxResult.from_error(f"Failed to create subprocess: {e}")

        # Execute with timeout
        timeout_secs = self.limits.wall_time_ms / 1000
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(input=stdin.encode() if stdin else None),
                timeout=timeout_secs,
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            logger.warning(f"Subprocess execution timed out after {timeout_secs}s")
            return SandboxResult.from_timeout(self.limits.wall_time_ms)

        duration_ms = int((time.time() - start_time) * 1000)
        exit_code = process.returncode or 0

        return SandboxResult(
            output=stdout,
            stderr=stderr,
            exit_code=exit_code,
            duration_ms=duration_ms,
            error=stderr.decode("utf-8", errors="replace") if exit_code != 0 else None,
        )

    def _get_command(self, language: str, file_path: str) -> list[str] | None:
        """Get the command to execute for a language."""
        base_cmd = self.LANGUAGE_COMMANDS.get(language.lower())
        if not base_cmd:
            return None
        return base_cmd + [file_path]

    def _get_file_suffix(self, language: str) -> str:
        """Get file suffix for a language."""
        suffixes = {
            "python": ".py",
            "python3": ".py",
            "node": ".js",
            "javascript": ".js",
            "bash": ".sh",
            "sh": ".sh",
        }
        return suffixes.get(language.lower(), ".txt")

    def _build_env(self) -> dict[str, str]:
        """Build environment variables for subprocess."""
        # Start with minimal environment
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": "/tmp",
            "LANG": "en_US.UTF-8",
        }
        # Add user-specified env vars
        env.update(self.env_vars)
        return env

    def _apply_rlimits(self) -> None:
        """Apply resource limits using Linux rlimit (called in preexec_fn)."""
        try:
            import resource

            # CPU time limit
            cpu_secs = max(1, self.limits.cpu_time_ms // 1000)
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_secs, cpu_secs))

            # Memory limit (address space)
            resource.setrlimit(
                resource.RLIMIT_AS,
                (self.limits.memory_bytes, self.limits.memory_bytes),
            )

            # File descriptor limit
            resource.setrlimit(
                resource.RLIMIT_NOFILE,
                (self.limits.max_open_files, self.limits.max_open_files),
            )

            # Process/thread limit
            resource.setrlimit(
                resource.RLIMIT_NPROC,
                (self.limits.max_threads, self.limits.max_threads),
            )

            # File size limit
            resource.setrlimit(
                resource.RLIMIT_FSIZE,
                (self.limits.max_file_size, self.limits.max_file_size),
            )

            logger.debug(
                f"Applied rlimits: CPU={cpu_secs}s, Memory={self.limits.memory_bytes // (1024*1024)}MB, "
                f"Files={self.limits.max_open_files}, Threads={self.limits.max_threads}"
            )
        except (ImportError, OSError) as e:
            logger.warning(f"Failed to apply rlimits: {e}")

    async def cleanup(self) -> None:
        """Clean up temporary files."""
        for temp_file in self._temp_files:
            try:
                os.unlink(temp_file)
            except OSError:
                pass
        self._temp_files.clear()

