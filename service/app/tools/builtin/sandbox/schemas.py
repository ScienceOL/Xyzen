"""
Input schemas for sandbox tools.

Pydantic models defining the input parameters for each sandbox tool.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.configs.sandbox import get_sandbox_workdir


def _wd() -> str:
    """Shorthand used by Field defaults that need the configured workdir."""
    return get_sandbox_workdir()


class SandboxBashInput(BaseModel):
    """Input schema for sandbox_bash tool."""

    command: str = Field(
        description=(
            "Shell command to execute in the sandbox. "
            "State persists across calls (installed packages, created files, environment variables). "
            "Use 'pip install' to add packages, 'cd' to change directories."
        )
    )
    cwd: str | None = Field(
        default=None,
        description=f"Working directory to run the command in. Defaults to {_wd()}.",
    )
    timeout: int | None = Field(
        default=None,
        description="Command timeout in seconds. Defaults to 120.",
    )


class SandboxReadInput(BaseModel):
    """Input schema for sandbox_read tool."""

    path: str = Field(
        description=f"Absolute path of the file to read in the sandbox (e.g. {_wd()}/main.py).",
    )


class SandboxWriteInput(BaseModel):
    """Input schema for sandbox_write tool."""

    path: str = Field(
        description=(
            "Absolute path of the file to create or overwrite in the sandbox. "
            "Parent directories are created automatically."
        ),
    )
    content: str = Field(
        description="Full content to write to the file.",
    )


class SandboxEditInput(BaseModel):
    """Input schema for sandbox_edit tool."""

    path: str = Field(
        description="Absolute path of the file to edit in the sandbox.",
    )
    old_text: str = Field(
        description=(
            "Exact text to find and replace. Must be unique within the file. "
            "Include enough surrounding context to ensure uniqueness."
        ),
    )
    new_text: str = Field(
        description="Replacement text. Must be different from old_text.",
    )


class SandboxGlobInput(BaseModel):
    """Input schema for sandbox_glob tool."""

    pattern: str = Field(
        description='Glob pattern to match files (e.g. "*.py", "src/**/*.ts").',
    )
    path: str = Field(
        default_factory=_wd,
        description="Root directory to search from.",
    )


class SandboxGrepInput(BaseModel):
    """Input schema for sandbox_grep tool."""

    pattern: str = Field(
        description="Regex or literal string pattern to search for in file contents.",
    )
    path: str = Field(
        default_factory=_wd,
        description="Root directory to search from.",
    )
    include: str | None = Field(
        default=None,
        description='File glob filter (e.g. "*.py", "*.ts").',
    )


class SandboxExportInput(BaseModel):
    """Input schema for sandbox_export tool."""

    path: str = Field(
        description=(
            "Absolute sandbox file path to export into user files "
            f"(must be under {_wd()}, e.g. {_wd()}/output/report.pdf)."
        ),
    )
    filename: str | None = Field(
        default=None,
        description=("Optional output filename in OSS. If omitted, uses the basename from path."),
    )


class SandboxPreviewInput(BaseModel):
    """Input schema for sandbox_preview tool."""

    port: int = Field(
        description="Port number of the running service in the sandbox (e.g. 3000, 5000, 8080).",
        ge=1,
        le=65535,
    )


class SandboxUploadInput(BaseModel):
    """Input schema for sandbox_upload tool."""

    file_id: str = Field(
        description="File ID from the user's file library to upload into the sandbox.",
    )
    path: str = Field(
        default_factory=_wd,
        description="Destination directory in the sandbox. The original filename is preserved.",
    )


__all__ = [
    "SandboxBashInput",
    "SandboxReadInput",
    "SandboxWriteInput",
    "SandboxEditInput",
    "SandboxGlobInput",
    "SandboxGrepInput",
    "SandboxExportInput",
    "SandboxPreviewInput",
    "SandboxUploadInput",
]
