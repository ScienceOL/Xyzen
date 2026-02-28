"""Settler persistent deployment configuration.

Settler creates dedicated long-running Daytona workspaces for persistent
port exposure. Sandbox = dev, Settler = deploy.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SettlerConfig(BaseModel):
    """Configuration for the Settler persistent deployment layer."""

    Enable: bool = Field(
        default=False,
        description="Enable the Settler deployment service. Off by default.",
    )
    ApiUrl: str = Field(
        default="http://host.docker.internal:13000/api",
        description="Daytona API server URL for deployment workspaces",
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
        description="Default Docker image for deployment workspaces",
    )
    AutoDeleteMinutes: int = Field(
        default=10080,
        description="Auto-delete deployment workspace after being stopped (minutes). Default 10080 = 7 days.",
    )
    ProxyBaseUrl: str = Field(
        default="app.xyzen.ai",
        description="Wildcard SSL domain for persistent deployment URLs",
    )
    ProxyProtocol: str = Field(
        default="https",
        description="Protocol for deployment URLs (http or https)",
    )
    Cpu: int = Field(
        default=1,
        description="CPU cores per deployment workspace",
    )
    Memory: int = Field(
        default=1,
        description="Memory in GiB per deployment workspace",
    )
    Disk: int = Field(
        default=2,
        description="Disk in GiB per deployment workspace",
    )
    MaxPerUser: int = Field(
        default=3,
        description="Maximum concurrent deployments per user",
    )
