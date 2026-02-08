"""
Sandbox tool factory functions.

Creates LangChain tools for sandbox code execution operations.
Follows the dual factory pattern:
- create_sandbox_tools() -> placeholders for registry
- create_sandbox_tools_for_session() -> session-bound working tools
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

from .operations import (
    sandbox_edit,
    sandbox_exec,
    sandbox_glob,
    sandbox_grep,
    sandbox_read,
    sandbox_write,
)
from .schemas import (
    SandboxBashInput,
    SandboxEditInput,
    SandboxGlobInput,
    SandboxGrepInput,
    SandboxReadInput,
    SandboxWriteInput,
)


def create_sandbox_tools() -> dict[str, BaseTool]:
    """
    Create sandbox tools with placeholder implementations.

    These are template tools for the registry — actual execution
    requires session binding via create_sandbox_tools_for_session().

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    tools: dict[str, BaseTool] = {}

    _placeholder_error: dict[str, Any] = {"error": "Sandbox tools require session context binding", "success": False}

    async def bash_placeholder(command: str, cwd: str | None = None, timeout: int | None = None) -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_bash"] = StructuredTool(
        name="sandbox_bash",
        description=(
            "Execute shell commands in an isolated sandbox environment. "
            "State persists across calls — installed packages, files, and environment "
            "variables are retained. Use for running code, installing dependencies, "
            "and system operations."
        ),
        args_schema=SandboxBashInput,
        coroutine=bash_placeholder,
    )

    async def read_placeholder(path: str) -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_read"] = StructuredTool(
        name="sandbox_read",
        description=(
            "Read the contents of a file in the sandbox. "
            "Returns the file content as text. Files larger than 100KB are truncated."
        ),
        args_schema=SandboxReadInput,
        coroutine=read_placeholder,
    )

    async def write_placeholder(path: str, content: str) -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_write"] = StructuredTool(
        name="sandbox_write",
        description=(
            "Create or overwrite a file in the sandbox. "
            "Parent directories are created automatically. "
            "Use for writing scripts, config files, or any text content."
        ),
        args_schema=SandboxWriteInput,
        coroutine=write_placeholder,
    )

    async def edit_placeholder(path: str, old_text: str, new_text: str) -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_edit"] = StructuredTool(
        name="sandbox_edit",
        description=(
            "Edit a file in the sandbox by replacing text. "
            "Finds old_text (must be unique in the file) and replaces it with new_text. "
            "Include enough surrounding context to ensure a unique match."
        ),
        args_schema=SandboxEditInput,
        coroutine=edit_placeholder,
    )

    async def glob_placeholder(pattern: str, path: str = "/workspace") -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_glob"] = StructuredTool(
        name="sandbox_glob",
        description=(
            "Find files by glob pattern in the sandbox. "
            'Supports patterns like "*.py", "src/**/*.ts". '
            "Returns up to 100 matching file paths."
        ),
        args_schema=SandboxGlobInput,
        coroutine=glob_placeholder,
    )

    async def grep_placeholder(pattern: str, path: str = "/workspace", include: str | None = None) -> dict[str, Any]:
        return _placeholder_error

    tools["sandbox_grep"] = StructuredTool(
        name="sandbox_grep",
        description=(
            "Search file contents in the sandbox using regex or literal patterns. "
            'Optionally filter by file type with include (e.g. "*.py"). '
            "Returns up to 50 matches with file, line number, and content."
        ),
        args_schema=SandboxGrepInput,
        coroutine=grep_placeholder,
    )

    return tools


def create_sandbox_tools_for_session(session_id: str) -> list[BaseTool]:
    """
    Create sandbox tools bound to a specific session.

    This creates actual working tools with session_id captured in closures.
    A SandboxManager is created lazily — no sandbox is provisioned until
    the first tool call.

    Args:
        session_id: Session UUID string

    Returns:
        List of BaseTool instances with session context bound
    """
    from app.infra.sandbox import get_sandbox_manager

    manager = get_sandbox_manager(session_id)
    tools: list[BaseTool] = []

    # --- sandbox_bash ---
    async def bash_bound(command: str, cwd: str | None = None, timeout: int | None = None) -> dict[str, Any]:
        return await sandbox_exec(manager, command, cwd=cwd, timeout=timeout)

    tools.append(
        StructuredTool(
            name="sandbox_bash",
            description=(
                "Execute shell commands in an isolated sandbox environment. "
                "State persists across calls — installed packages, files, and environment "
                "variables are retained. Use for running code, installing dependencies, "
                "and system operations."
            ),
            args_schema=SandboxBashInput,
            coroutine=bash_bound,
        )
    )

    # --- sandbox_read ---
    async def read_bound(path: str) -> dict[str, Any]:
        return await sandbox_read(manager, path)

    tools.append(
        StructuredTool(
            name="sandbox_read",
            description=(
                "Read the contents of a file in the sandbox. "
                "Returns the file content as text. Files larger than 100KB are truncated."
            ),
            args_schema=SandboxReadInput,
            coroutine=read_bound,
        )
    )

    # --- sandbox_write ---
    async def write_bound(path: str, content: str) -> dict[str, Any]:
        return await sandbox_write(manager, path, content)

    tools.append(
        StructuredTool(
            name="sandbox_write",
            description=(
                "Create or overwrite a file in the sandbox. "
                "Parent directories are created automatically. "
                "Use for writing scripts, config files, or any text content."
            ),
            args_schema=SandboxWriteInput,
            coroutine=write_bound,
        )
    )

    # --- sandbox_edit ---
    async def edit_bound(path: str, old_text: str, new_text: str) -> dict[str, Any]:
        return await sandbox_edit(manager, path, old_text, new_text)

    tools.append(
        StructuredTool(
            name="sandbox_edit",
            description=(
                "Edit a file in the sandbox by replacing text. "
                "Finds old_text (must be unique in the file) and replaces it with new_text. "
                "Include enough surrounding context to ensure a unique match."
            ),
            args_schema=SandboxEditInput,
            coroutine=edit_bound,
        )
    )

    # --- sandbox_glob ---
    async def glob_bound(pattern: str, path: str = "/workspace") -> dict[str, Any]:
        return await sandbox_glob(manager, pattern, path=path)

    tools.append(
        StructuredTool(
            name="sandbox_glob",
            description=(
                "Find files by glob pattern in the sandbox. "
                'Supports patterns like "*.py", "src/**/*.ts". '
                "Returns up to 100 matching file paths."
            ),
            args_schema=SandboxGlobInput,
            coroutine=glob_bound,
        )
    )

    # --- sandbox_grep ---
    async def grep_bound(pattern: str, path: str = "/workspace", include: str | None = None) -> dict[str, Any]:
        return await sandbox_grep(manager, pattern, path=path, include=include)

    tools.append(
        StructuredTool(
            name="sandbox_grep",
            description=(
                "Search file contents in the sandbox using regex or literal patterns. "
                'Optionally filter by file type with include (e.g. "*.py"). '
                "Returns up to 50 matches with file, line number, and content."
            ),
            args_schema=SandboxGrepInput,
            coroutine=grep_bound,
        )
    )

    return tools


__all__ = [
    "create_sandbox_tools",
    "create_sandbox_tools_for_session",
]
