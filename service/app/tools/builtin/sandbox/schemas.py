"""
Input schemas for sandbox tools.

Pydantic models defining the input parameters for each sandbox tool.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


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
        description="Working directory to run the command in. Defaults to /workspace.",
    )
    timeout: int | None = Field(
        default=None,
        description="Command timeout in seconds. Defaults to 120.",
    )


class SandboxReadInput(BaseModel):
    """Input schema for sandbox_read tool."""

    path: str = Field(
        description="Absolute path of the file to read in the sandbox (e.g. /workspace/main.py).",
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
        default="/workspace",
        description="Root directory to search from.",
    )


class SandboxGrepInput(BaseModel):
    """Input schema for sandbox_grep tool."""

    pattern: str = Field(
        description="Regex or literal string pattern to search for in file contents.",
    )
    path: str = Field(
        default="/workspace",
        description="Root directory to search from.",
    )
    include: str | None = Field(
        default=None,
        description='File glob filter (e.g. "*.py", "*.ts").',
    )


__all__ = [
    "SandboxBashInput",
    "SandboxReadInput",
    "SandboxWriteInput",
    "SandboxEditInput",
    "SandboxGlobInput",
    "SandboxGrepInput",
]
