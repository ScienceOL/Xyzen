"""
Resource Limits

Defines resource constraints for sandbox execution.
"""

from dataclasses import dataclass, field
from typing import Any

from app.configs import configs


@dataclass
class ResourceLimits:
    """Resource limits for sandboxed execution."""

    # Memory limit in bytes
    memory_bytes: int = field(default_factory=lambda: 256 * 1024 * 1024)

    # CPU time limit in milliseconds
    cpu_time_ms: int = 5000  # 5 seconds

    # Wall clock time limit in milliseconds
    wall_time_ms: int = field(default_factory=lambda: 30 * 1000)

    # Maximum number of threads
    max_threads: int = 4

    # Maximum file size in bytes
    max_file_size: int = field(default_factory=lambda: 10 * 1024 * 1024)

    # Maximum number of open files
    max_open_files: int = 10

    # Fuel limit for WASM execution
    max_fuel: int = field(default_factory=lambda: 1_000_000_000)

    @classmethod
    def from_config(cls) -> "ResourceLimits":
        """Create ResourceLimits from application config."""
        sandbox_config = getattr(configs, "Sandbox", None)
        if sandbox_config is None:
            return cls()

        return cls(
            memory_bytes=sandbox_config.memory_limit_bytes,
            cpu_time_ms=sandbox_config.cpu_time_limit_secs * 1000,
            wall_time_ms=sandbox_config.execution_timeout_secs * 1000,
            max_threads=sandbox_config.max_threads,
            max_file_size=sandbox_config.max_file_size_bytes,
            max_open_files=sandbox_config.max_open_files,
            max_fuel=sandbox_config.max_fuel,
        )

    @classmethod
    def default(cls) -> "ResourceLimits":
        """Create default ResourceLimits."""
        return cls.from_config()

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "memory_bytes": self.memory_bytes,
            "cpu_time_ms": self.cpu_time_ms,
            "wall_time_ms": self.wall_time_ms,
            "max_threads": self.max_threads,
            "max_file_size": self.max_file_size,
            "max_open_files": self.max_open_files,
            "max_fuel": self.max_fuel,
        }

    def validate_memory_usage(self, bytes_used: int) -> bool:
        """Check if memory usage is within limits."""
        return bytes_used <= self.memory_bytes

    def validate_file_size(self, size: int) -> bool:
        """Check if file size is within limits."""
        return size <= self.max_file_size

