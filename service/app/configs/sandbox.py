"""Sandbox execution configuration.

Generic settings live at the top level. Provider-specific settings are
nested under their own model so adding a new backend never pollutes the
shared namespace.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DaytonaConfig(BaseModel):
    """Daytona-specific sandbox configuration."""

    ApiUrl: str = Field(
        default="http://host.docker.internal:13000/api",
        description="Daytona API server URL",
    )
    ApiKey: str = Field(
        default="xyzen-dev-admin-key",
        description="Daytona API key for authentication",
    )
    Target: str = Field(
        default="us",
        description="Daytona target region",
    )
    Image: str = Field(
        default="python:3.12-slim",
        description="Default Docker image for Daytona sandboxes",
    )
    AutoStopMinutes: int = Field(
        default=30,
        description="Auto-stop sandbox after inactivity (minutes)",
    )
    AutoDeleteMinutes: int = Field(
        default=4320,
        description="Auto-delete sandbox after being continuously stopped (minutes). "
        "Default 4320 = 3 days. Set -1 to disable.",
    )
    ProxyBaseUrl: str = Field(
        default="localhost:14000",
        description="Base URL for sandbox preview proxy (reachable from user browser). "
        "Set to your wildcard domain in production (e.g., sandbox.sciol.ac.cn).",
    )
    ProxyProtocol: str = Field(
        default="http",
        description="Protocol for preview URLs (http or https)",
    )


class E2BConfig(BaseModel):
    """E2B-specific sandbox configuration."""

    ApiKey: str = Field(
        default="",
        description="E2B API key",
    )
    Template: str = Field(
        default="base",
        description="E2B sandbox template ID",
    )
    TimeoutSeconds: int = Field(
        default=300,
        description="Sandbox lifetime in seconds before auto-shutdown",
    )


class SandboxConfig(BaseModel):
    """Configuration for sandbox code execution environments.

    Generic fields at top level, provider configs nested.
    """

    # --- Generic ---
    Enable: bool = Field(
        default=True,
        description="Enable sandbox code execution tools",
    )
    Backend: str = Field(
        default="daytona",
        description="Sandbox backend provider (daytona, e2b)",
    )
    Cpu: int = Field(
        default=2,
        description="CPU cores allocated per sandbox (provider may map to nearest tier)",
    )
    Memory: int = Field(
        default=2,
        description="Memory in GiB allocated per sandbox",
    )
    Disk: int = Field(
        default=3,
        description="Disk in GiB allocated per sandbox",
    )
    Timeout: int = Field(
        default=120,
        description="Command execution timeout in seconds",
    )
    WorkDir: str = Field(
        default="/workspace",
        description="Default working directory inside sandbox",
    )

    # --- Provider-specific (nested) ---
    Daytona: DaytonaConfig = Field(default_factory=DaytonaConfig)
    E2B: E2BConfig = Field(default_factory=E2BConfig)
