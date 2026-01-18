"""
Sandbox Configuration

Configuration for code execution sandbox with resource limits.
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class SandboxConfig(BaseSettings):
    """Sandbox execution configuration with resource limits."""

    # Memory limits
    memory_limit_bytes: int = Field(
        default=256 * 1024 * 1024,  # 256MB
        description="Maximum memory in bytes for sandbox execution",
    )

    # CPU/Time limits
    execution_timeout_secs: int = Field(
        default=30,
        description="Maximum execution time in seconds",
    )

    cpu_time_limit_secs: int = Field(
        default=5,
        description="Maximum CPU time in seconds",
    )

    # Fuel limit for WASM execution (computational steps)
    max_fuel: int = Field(
        default=1_000_000_000,  # 1 billion
        description="Maximum fuel units for WASM execution",
    )

    # File system limits
    max_file_size_bytes: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        description="Maximum file size in bytes",
    )

    max_open_files: int = Field(
        default=10,
        description="Maximum number of open files",
    )

    # Process limits
    max_threads: int = Field(
        default=4,
        description="Maximum number of threads",
    )

    # Filesystem access
    enable_filesystem: bool = Field(
        default=True,
        description="Enable filesystem access in sandbox",
    )

    allowed_paths: list[str] = Field(
        default_factory=lambda: ["/tmp", "/data/cache"],
        description="Allowed filesystem paths for sandbox access",
    )

    # Security settings
    allow_network: bool = Field(
        default=False,
        description="Allow network access in sandbox (disabled by default)",
    )

    allow_env_access: bool = Field(
        default=False,
        description="Allow environment variable access",
    )

    # Backend selection
    default_backend: str = Field(
        default="subprocess",
        description="Default sandbox backend: subprocess, docker, kubernetes, wasm",
    )

    # Docker/Kubernetes settings (for container backends)
    docker_image: str = Field(
        default="python:3.12-slim",
        description="Docker image for container sandbox",
    )

    kube_namespace: str = Field(
        default="sandbox",
        description="Kubernetes namespace for sandbox pods",
    )

    # Security policy
    security_severity_threshold: str = Field(
        default="MEDIUM",
        description="Security severity threshold: LOW, MEDIUM, HIGH, CRITICAL",
    )

    # Cache settings
    enable_result_cache: bool = Field(
        default=True,
        description="Enable caching of execution results",
    )

    cache_ttl_secs: int = Field(
        default=300,  # 5 minutes
        description="Cache TTL in seconds",
    )
