"""
Sandbox tool operations.

Each operation delegates to a SandboxManager and returns a dict
with a `success` bool and either result data or an `error` message.
"""

from __future__ import annotations

import logging
import mimetypes
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any

from app.configs import configs
from app.core.storage import (
    FileScope,
    create_quota_service,
    detect_file_category,
    generate_storage_key,
    get_storage_service,
)
from app.infra.database import get_task_db_session
from app.infra.sandbox.manager import SandboxManager
from app.models.file import FileCreate
from app.repos.file import FileRepository

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
        formatted: list[dict[str, str | int]] = [
            {"file": m.file, "line": m.line, "content": m.content} for m in matches
        ]
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


def _normalize_export_path(path: str) -> str:
    normalized = path.strip().replace("\\", "/")
    if not normalized:
        raise ValueError("Path is required")
    if normalized.startswith("//"):
        raise ValueError("Path must be a normalized absolute path")

    pure = PurePosixPath(normalized)
    if not pure.is_absolute():
        raise ValueError("Path must be absolute (e.g. /workspace/output.txt)")

    for part in pure.parts:
        if part == "/":
            continue
        if part in ("", ".", ".."):
            raise ValueError(f"Path contains invalid segments: {path!r}")

    return pure.as_posix()


def _validate_export_root(path: str) -> None:
    workdir_raw = (configs.Sandbox.WorkDir or "/workspace").strip()
    workdir = workdir_raw if workdir_raw.startswith("/") else f"/{workdir_raw}"
    root = PurePosixPath(workdir).as_posix()

    if root == "/":
        return
    if path != root and not path.startswith(f"{root}/"):
        raise ValueError(f"Path must be inside sandbox work directory: {root}")


def _resolve_export_filename(path: str, filename: str | None) -> str:
    resolved = filename.strip() if filename else PurePosixPath(path).name
    if not resolved:
        raise ValueError("Could not infer filename from path. Provide the filename parameter explicitly.")
    if resolved in (".", ".."):
        raise ValueError("Filename must be a regular file name")
    if "/" in resolved or "\\" in resolved:
        raise ValueError("Filename must not include path separators")
    return resolved


def _detect_content_type(filename: str) -> str:
    content_type, _ = mimetypes.guess_type(filename)
    if filename.lower().endswith(".md"):
        return "text/markdown"
    return content_type or "application/octet-stream"


async def _persist_exported_file(
    *,
    user_id: str,
    session_id: str,
    sandbox_path: str,
    filename: str,
    file_bytes: bytes,
) -> dict[str, Any]:
    storage = get_storage_service()
    content_type = _detect_content_type(filename)
    category = detect_file_category(filename)
    storage_key = generate_storage_key(
        user_id=user_id,
        filename=filename,
        scope=FileScope.PRIVATE,
        category=category,
    )

    uploaded = False
    try:
        async with get_task_db_session() as db:
            quota_service = await create_quota_service(db, user_id)
            await quota_service.validate_upload(user_id, len(file_bytes))

            await storage.upload_file(
                file_data=BytesIO(file_bytes),
                storage_key=storage_key,
                content_type=content_type,
                metadata={
                    "user_id": user_id,
                    "source": "sandbox_export",
                    "sandbox_session_id": session_id,
                    "sandbox_path": sandbox_path,
                },
            )
            uploaded = True

            file_repo = FileRepository(db)
            file_record = await file_repo.create_file(
                FileCreate(
                    user_id=user_id,
                    storage_key=storage_key,
                    original_filename=filename,
                    content_type=content_type,
                    file_size=len(file_bytes),
                    scope=FileScope.PRIVATE,
                    category=category,
                    status="confirmed",
                    metainfo={
                        "source": "sandbox_export",
                        "sandbox_session_id": session_id,
                        "sandbox_path": sandbox_path,
                    },
                )
            )
            await db.commit()
            await db.refresh(file_record)

        return {
            "success": True,
            "file_id": str(file_record.id),
            "filename": filename,
            "storage_key": storage_key,
            "content_type": content_type,
            "size_bytes": len(file_bytes),
            "download_url": f"/xyzen/api/v1/files/{file_record.id}/download",
        }
    except Exception:
        if uploaded:
            try:
                await storage.delete_file(storage_key)
            except Exception:
                logger.warning("Failed to cleanup exported sandbox object: %s", storage_key, exc_info=True)
        raise


async def sandbox_export(
    manager: SandboxManager,
    *,
    user_id: str | None,
    session_id: str,
    path: str,
    filename: str | None = None,
) -> dict[str, Any]:
    """Export a sandbox file into OSS and register it in user file records."""
    if not user_id:
        return {
            "success": False,
            "error": "sandbox_export requires user context",
        }

    try:
        normalized_path = _normalize_export_path(path)
        _validate_export_root(normalized_path)
        resolved_filename = _resolve_export_filename(normalized_path, filename)

        file_bytes = await manager.read_file_bytes(normalized_path)
        max_bytes = int(configs.OSS.MaxFileUploadBytes)
        if len(file_bytes) > max_bytes:
            return {
                "success": False,
                "error": (
                    f"File exceeds maximum allowed size ({len(file_bytes)} bytes > {max_bytes} bytes). "
                    "Please split or compress the file before exporting."
                ),
            }

        result = await _persist_exported_file(
            user_id=user_id,
            session_id=session_id,
            sandbox_path=normalized_path,
            filename=resolved_filename,
            file_bytes=file_bytes,
        )
        result["sandbox_path"] = normalized_path
        return result
    except Exception as e:
        logger.error("sandbox_export failed: %s", e)
        return {"success": False, "error": str(e)}


async def sandbox_preview(
    manager: SandboxManager,
    *,
    port: int,
) -> dict[str, Any]:
    """Get a browser-accessible preview URL for a port in the sandbox."""
    try:
        preview = await manager.get_preview_url(port)
        return {
            "success": True,
            "url": preview.url,
            "port": preview.port,
            "message": f"Service is accessible at: {preview.url}",
        }
    except Exception as e:
        logger.error("sandbox_preview failed: %s", e)
        return {"success": False, "error": str(e)}


async def sandbox_upload(
    manager: SandboxManager,
    *,
    user_id: str | None,
    file_id: str,
    path: str = "/workspace",
) -> dict[str, Any]:
    """Upload a file from user's library into the sandbox."""
    if not user_id:
        return {"success": False, "error": "sandbox_upload requires user context"}

    try:
        from uuid import UUID

        from app.core.storage import get_storage_service
        from app.infra.database import get_task_db_session
        from app.repos.file import FileRepository

        # Validate file_id
        try:
            file_uuid = UUID(file_id)
        except ValueError:
            return {"success": False, "error": f"Invalid file_id format: {file_id}"}

        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            file_record = await file_repo.get_file_by_id(file_uuid)

            if file_record is None:
                return {"success": False, "error": f"File not found: {file_id}"}
            if file_record.is_deleted:
                return {"success": False, "error": f"File has been deleted: {file_id}"}
            if file_record.user_id != user_id and file_record.scope != "public":
                return {"success": False, "error": "Permission denied: you don't have access to this file"}

            storage_key = file_record.storage_key
            if not storage_key:
                return {"success": False, "error": f"File has no storage key: {file_id}"}
            raw_filename = file_record.original_filename or PurePosixPath(storage_key).name
            try:
                filename = _resolve_export_filename("/workspace/upload.bin", raw_filename)
            except ValueError as e:
                return {"success": False, "error": f"Invalid filename in file record: {e}"}

        # Download from OSS
        storage = get_storage_service()
        buffer = BytesIO()
        await storage.download_file(storage_key, buffer)
        file_bytes = buffer.getvalue()

        # Validate and upload to sandbox
        dest_dir = _normalize_export_path(path)
        _validate_export_root(dest_dir)
        dest_path = f"{dest_dir.rstrip('/')}/{filename}"
        await manager.write_file_bytes(dest_path, file_bytes)

        return {
            "success": True,
            "filename": filename,
            "sandbox_path": dest_path,
            "size_bytes": len(file_bytes),
        }
    except Exception as e:
        logger.error("sandbox_upload failed: %s", e)
        return {"success": False, "error": str(e)}


__all__ = [
    "sandbox_exec",
    "sandbox_read",
    "sandbox_write",
    "sandbox_edit",
    "sandbox_glob",
    "sandbox_grep",
    "sandbox_export",
    "sandbox_preview",
    "sandbox_upload",
]
