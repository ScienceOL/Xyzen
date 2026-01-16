"""
Sandbox Result

Represents the result of a sandbox execution.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SandboxResult:
    """Result of sandbox execution."""

    # Output data (stdout)
    output: bytes = field(default_factory=bytes)

    # Exit code (0 = success)
    exit_code: int = 0

    # CPU time used in milliseconds
    cpu_time_used_ms: int = 0

    # Memory used in bytes
    memory_used_bytes: int = 0

    # Error message if execution failed
    error: str | None = None

    # Standard error output
    stderr: bytes = field(default_factory=bytes)

    # Execution duration in milliseconds
    duration_ms: int = 0

    @property
    def success(self) -> bool:
        """Check if execution was successful."""
        return self.exit_code == 0 and self.error is None

    @property
    def output_str(self) -> str:
        """Get output as string."""
        return self.output.decode("utf-8", errors="replace")

    @property
    def stderr_str(self) -> str:
        """Get stderr as string."""
        return self.stderr.decode("utf-8", errors="replace")

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "output": self.output_str,
            "exit_code": self.exit_code,
            "cpu_time_used_ms": self.cpu_time_used_ms,
            "memory_used_bytes": self.memory_used_bytes,
            "error": self.error,
            "stderr": self.stderr_str,
            "duration_ms": self.duration_ms,
            "success": self.success,
        }

    @classmethod
    def from_error(cls, error: str, exit_code: int = 1) -> "SandboxResult":
        """Create a result from an error."""
        return cls(
            exit_code=exit_code,
            error=error,
        )

    @classmethod
    def from_timeout(cls, timeout_ms: int) -> "SandboxResult":
        """Create a result from a timeout."""
        return cls(
            exit_code=-1,
            error=f"Execution timed out after {timeout_ms}ms",
            duration_ms=timeout_ms,
        )

