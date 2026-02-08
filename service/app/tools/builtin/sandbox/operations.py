"""
Sandbox tool operations.

Each operation delegates to a SandboxManager and returns a dict
with a `success` bool and either result data or an `error` message.
"""

from __future__ import annotations

import logging
from typing import Any

from app.infra.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

_MAX_READ_BYTES = 100 * 1024  # 100 KB


async def sandbox_exec(
    manager: SandboxManager,
    command: str,
    cwd: str | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Execute a shell command in the sandbox."""
    try:
        result = await manager.exec(command, cwd=cwd, timeout=timeout)
        return {
            "success": True,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        logger.error(f"sandbox_exec failed: {e}")
        return {"success": False, "error": str(e)}


async def sandbox_read(manager: SandboxManager, path: str) -> dict[str, Any]:
    """Read a file from the sandbox."""
    try:
        content = await manager.read_file(path)
        truncated = False
        if len(content.encode("utf-8")) > _MAX_READ_BYTES:
            content = content[: _MAX_READ_BYTES // 2]  # rough char estimate
            truncated = True
        result: dict[str, Any] = {
            "success": True,
            "path": path,
            "content": content,
        }
        if truncated:
            result["warning"] = "File truncated at 100KB. Use sandbox_bash with head/tail for large files."
        return result
    except Exception as e:
        logger.error(f"sandbox_read failed: {e}")
        return {"success": False, "error": str(e)}


async def sandbox_write(manager: SandboxManager, path: str, content: str) -> dict[str, Any]:
    """Write a file to the sandbox."""
    try:
        await manager.write_file(path, content)
        return {
            "success": True,
            "path": path,
            "bytes_written": len(content.encode("utf-8")),
        }
    except Exception as e:
        logger.error(f"sandbox_write failed: {e}")
        return {"success": False, "error": str(e)}


async def sandbox_edit(
    manager: SandboxManager,
    path: str,
    old_text: str,
    new_text: str,
) -> dict[str, Any]:
    """Search-and-replace edit in a sandbox file. Validates unique match."""
    try:
        content = await manager.read_file(path)

        # Validate unique match
        count = content.count(old_text)
        if count == 0:
            return {"success": False, "error": "old_text not found in file"}
        if count > 1:
            return {
                "success": False,
                "error": f"old_text matches {count} locations. Provide more context to make it unique.",
            }

        new_content = content.replace(old_text, new_text, 1)
        await manager.write_file(path, new_content)
        return {"success": True, "path": path}
    except Exception as e:
        logger.error(f"sandbox_edit failed: {e}")
        return {"success": False, "error": str(e)}


async def sandbox_glob(
    manager: SandboxManager,
    pattern: str,
    path: str = "/workspace",
) -> dict[str, Any]:
    """Find files matching a glob pattern in the sandbox."""
    try:
        matches = await manager.find_files(path, pattern)
        return {
            "success": True,
            "pattern": pattern,
            "root": path,
            "matches": matches,
            "count": len(matches),
        }
    except Exception as e:
        logger.error(f"sandbox_glob failed: {e}")
        return {"success": False, "error": str(e)}


async def sandbox_grep(
    manager: SandboxManager,
    pattern: str,
    path: str = "/workspace",
    include: str | None = None,
) -> dict[str, Any]:
    """Search file contents in the sandbox."""
    try:
        matches = await manager.search_in_files(path, pattern, include=include)
        formatted = [{"file": m.file, "line": m.line, "content": m.content} for m in matches]
        return {
            "success": True,
            "pattern": pattern,
            "root": path,
            "matches": formatted,
            "count": len(formatted),
        }
    except Exception as e:
        logger.error(f"sandbox_grep failed: {e}")
        return {"success": False, "error": str(e)}


__all__ = [
    "sandbox_exec",
    "sandbox_read",
    "sandbox_write",
    "sandbox_edit",
    "sandbox_glob",
    "sandbox_grep",
]
