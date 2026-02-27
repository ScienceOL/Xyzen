"""
Sandbox tool factory functions.

Creates LangChain tools for sandbox code execution operations.

Tool metadata (name, description, schema) is defined once in ``_TOOL_DEFS``
and reused by both factory functions:
- create_sandbox_tools()            → placeholders for the registry
- create_sandbox_tools_for_session()→ session-bound working tools
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel

if TYPE_CHECKING:
    from app.infra.sandbox.manager import SandboxManager

from .operations import (
    sandbox_deploy,
    sandbox_edit,
    sandbox_exec,
    sandbox_export,
    sandbox_glob,
    sandbox_grep,
    sandbox_preview,
    sandbox_read,
    sandbox_upload,
    sandbox_write,
)
from .schemas import (
    SandboxBashInput,
    SandboxDeployInput,
    SandboxEditInput,
    SandboxExportInput,
    SandboxGlobInput,
    SandboxGrepInput,
    SandboxPreviewInput,
    SandboxReadInput,
    SandboxUploadInput,
    SandboxWriteInput,
    _wd,
)


@dataclass(frozen=True)
class _ToolDef:
    """Immutable definition for one sandbox tool."""

    tool_id: str
    description: str
    args_schema: type[BaseModel]


# Single source of truth for all sandbox tool metadata.
_TOOL_DEFS: list[_ToolDef] = [
    _ToolDef(
        tool_id="sandbox_bash",
        description=(
            "Execute shell commands in an isolated sandbox environment. "
            "State persists across calls — installed packages, files, and environment "
            "variables are retained. Use for running code, installing dependencies, "
            "and system operations."
        ),
        args_schema=SandboxBashInput,
    ),
    _ToolDef(
        tool_id="sandbox_read",
        description=(
            "Read the contents of a file in the sandbox. "
            "Returns the file content as text. Files larger than 100KB are truncated."
        ),
        args_schema=SandboxReadInput,
    ),
    _ToolDef(
        tool_id="sandbox_write",
        description=(
            "Create or overwrite a file in the sandbox. "
            "Parent directories are created automatically. "
            "Use for writing scripts, config files, or any text content."
        ),
        args_schema=SandboxWriteInput,
    ),
    _ToolDef(
        tool_id="sandbox_edit",
        description=(
            "Edit a file in the sandbox by replacing text. "
            "Finds old_text (must be unique in the file) and replaces it with new_text. "
            "Include enough surrounding context to ensure a unique match."
        ),
        args_schema=SandboxEditInput,
    ),
    _ToolDef(
        tool_id="sandbox_glob",
        description=(
            "Find files by glob pattern in the sandbox. "
            'Supports patterns like "*.py", "src/**/*.ts". '
            "Returns up to 100 matching file paths."
        ),
        args_schema=SandboxGlobInput,
    ),
    _ToolDef(
        tool_id="sandbox_grep",
        description=(
            "Search file contents in the sandbox using regex or literal patterns. "
            'Optionally filter by file type with include (e.g. "*.py"). '
            "Returns up to 50 matches with file, line number, and content."
        ),
        args_schema=SandboxGrepInput,
    ),
    _ToolDef(
        tool_id="sandbox_export",
        description=(
            "Export a file from the sandbox into your file library. "
            f"The path must be under {_wd()}. Returns a file_id and download URL."
        ),
        args_schema=SandboxExportInput,
    ),
    _ToolDef(
        tool_id="sandbox_preview",
        description=(
            "Get a browser-accessible URL for a service running in the sandbox. "
            "Start a web server (e.g. Flask, Express, HTTP server) on a port, "
            "then call this tool to get a public URL the user can open in their browser."
        ),
        args_schema=SandboxPreviewInput,
    ),
    _ToolDef(
        tool_id="sandbox_upload",
        description=(
            "Upload a file from the user's file library into the sandbox. "
            "Provide the file_id and an optional destination directory. "
            "The original filename is preserved."
        ),
        args_schema=SandboxUploadInput,
    ),
]

# Deploy tool is defined separately — only included when Settler is enabled.
_DEPLOY_TOOL_DEF = _ToolDef(
    tool_id="sandbox_deploy",
    description=(
        "Deploy a service from the sandbox to a persistent public URL. "
        "The service will keep running even after the sandbox stops. "
        "First ensure your app works via sandbox_preview, then use this to deploy permanently. "
        "Returns a stable HTTPS URL on app.xyzen.ai."
    ),
    args_schema=SandboxDeployInput,
)

# Type alias for bound coroutines returned by the binder functions.
type _BoundCoro = Callable[..., Coroutine[Any, Any, dict[str, Any]]]


def _get_all_tool_defs() -> list[_ToolDef]:
    """Return the full tool def list, conditionally including deploy."""
    from app.configs import configs

    defs = list(_TOOL_DEFS)
    if configs.Settler.Enable:
        defs.append(_DEPLOY_TOOL_DEF)
    return defs


def create_sandbox_tools() -> dict[str, BaseTool]:
    """
    Create sandbox tools with placeholder implementations.

    These are template tools for the registry — actual execution
    requires session binding via create_sandbox_tools_for_session().

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    _placeholder_error: dict[str, Any] = {
        "error": "Sandbox tools require session context binding",
        "success": False,
    }

    async def _noop(**_: Any) -> dict[str, Any]:
        return _placeholder_error

    return {
        td.tool_id: StructuredTool(
            name=td.tool_id,
            description=td.description,
            args_schema=td.args_schema,
            coroutine=_noop,
        )
        for td in _get_all_tool_defs()
    }


def create_sandbox_tools_for_session(
    session_id: str,
    user_id: str | None = None,
) -> list[BaseTool]:
    """
    Create sandbox tools bound to a specific session.

    A SandboxManager is resolved lazily on first tool call — this allows
    async Runner detection (checking Redis for online runners) without
    requiring the caller to be async.

    Args:
        session_id: Session UUID string
        user_id: Current user ID (needed for sandbox_export/upload and Runner routing)

    Returns:
        List of BaseTool instances with session context bound
    """
    # Lazy async manager holder — resolved on first tool invocation
    _manager_holder: list["SandboxManager | None"] = [None]

    async def _get_manager() -> "SandboxManager":
        if _manager_holder[0] is None:
            from app.infra.sandbox import get_sandbox_manager

            _manager_holder[0] = await get_sandbox_manager(session_id, user_id=user_id)
        return _manager_holder[0]

    # Map each tool_id to its session-bound coroutine.
    binders = _build_lazy_binders(_get_manager, session_id=session_id, user_id=user_id)

    tools: list[BaseTool] = []
    for td in _get_all_tool_defs():
        bound = binders.get(td.tool_id)
        if bound is None:
            continue
        tools.append(
            StructuredTool(
                name=td.tool_id,
                description=td.description,
                args_schema=td.args_schema,
                coroutine=bound,
            )
        )
    return tools


def _build_lazy_binders(
    get_manager: Callable[[], Coroutine[Any, Any, "SandboxManager"]],
    *,
    session_id: str,
    user_id: str | None,
) -> dict[str, _BoundCoro]:
    """Return a dict mapping tool_id → lazy async callable that resolves the manager on first use."""

    async def bash_bound(command: str, cwd: str | None = None, timeout: int | None = None) -> dict[str, Any]:
        return await sandbox_exec(await get_manager(), command, cwd=cwd, timeout=timeout)

    async def read_bound(path: str) -> dict[str, Any]:
        return await sandbox_read(await get_manager(), path)

    async def write_bound(path: str, content: str) -> dict[str, Any]:
        return await sandbox_write(await get_manager(), path, content)

    async def edit_bound(path: str, old_text: str, new_text: str) -> dict[str, Any]:
        return await sandbox_edit(await get_manager(), path, old_text, new_text)

    async def glob_bound(pattern: str, path: str = "") -> dict[str, Any]:
        return await sandbox_glob(await get_manager(), pattern, path=path or _wd())

    async def grep_bound(pattern: str, path: str = "", include: str | None = None) -> dict[str, Any]:
        return await sandbox_grep(await get_manager(), pattern, path=path or _wd(), include=include)

    async def export_bound(path: str, filename: str | None = None) -> dict[str, Any]:
        return await sandbox_export(
            await get_manager(), user_id=user_id, session_id=session_id, path=path, filename=filename
        )

    async def preview_bound(port: int) -> dict[str, Any]:
        return await sandbox_preview(await get_manager(), port=port)

    async def upload_bound(file_id: str, path: str = "") -> dict[str, Any]:
        return await sandbox_upload(await get_manager(), user_id=user_id, file_id=file_id, path=path or _wd())

    async def deploy_bound(port: int, start_command: str, source_dir: str = "") -> dict[str, Any]:
        return await sandbox_deploy(
            await get_manager(),
            user_id=user_id,
            session_id=session_id,
            port=port,
            start_command=start_command,
            source_dir=source_dir or _wd(),
        )

    return {
        "sandbox_bash": bash_bound,
        "sandbox_read": read_bound,
        "sandbox_write": write_bound,
        "sandbox_edit": edit_bound,
        "sandbox_glob": glob_bound,
        "sandbox_grep": grep_bound,
        "sandbox_export": export_bound,
        "sandbox_preview": preview_bound,
        "sandbox_upload": upload_bound,
        "sandbox_deploy": deploy_bound,
    }


__all__ = [
    "create_sandbox_tools",
    "create_sandbox_tools_for_session",
]
