"""Sandbox execution configuration."""

from pydantic import BaseModel, Field


class SandboxConfig(BaseModel):
    """Configuration for sandbox code execution environments."""

    Enable: bool = Field(
        default=False,
        description="Enable sandbox code execution tools",
    )
    Backend: str = Field(
        default="daytona",
        description="Sandbox backend provider (daytona, e2b)",
    )
    DaytonaApiUrl: str = Field(
        default="http://localhost:3000/api",
        description="Daytona API server URL",
    )
    DaytonaApiKey: str = Field(
        default="",
        description="Daytona API key for authentication",
    )
    DaytonaTarget: str = Field(
        default="us",
        description="Daytona target region",
    )
    Cpu: int = Field(
        default=2,
        description="CPU cores allocated per sandbox",
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
    AutoStopMinutes: int = Field(
        default=30,
        description="Auto-stop sandbox after inactivity (minutes)",
    )
    WorkDir: str = Field(
        default="/workspace",
        description="Default working directory inside sandbox",
    )
