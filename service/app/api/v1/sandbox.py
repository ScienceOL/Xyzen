"""REST API endpoints for sandbox file browsing and content serving."""

from __future__ import annotations

import logging
import mimetypes
from pathlib import PurePosixPath
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs.sandbox import get_sandbox_workdir
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.repos.session import SessionRepository

if TYPE_CHECKING:
    from app.infra.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sandbox"])

_MAX_SERVE_BYTES = 50 * 1024 * 1024  # 50 MB

_WORKDIR_ROOT = get_sandbox_workdir()


class SandboxFileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None


class SandboxFilesResponse(BaseModel):
    files: list[SandboxFileInfo]
    sandbox_active: bool


class SandboxPreviewResponse(BaseModel):
    url: str
    port: int


async def _validate_session_ownership(
    session_id: UUID,
    user: str,
    db: AsyncSession,
) -> None:
    """Validate that the user owns the session. Raises HTTPException on failure."""
    session_repo = SessionRepository(db)
    session = await session_repo.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied")


async def _get_manager(session_id: UUID) -> SandboxManager:
    """Get a SandboxManager for the given session (read-only, no provisioning)."""
    from app.infra.sandbox import get_sandbox_manager

    return await get_sandbox_manager(str(session_id))


def _validate_sandbox_path(path: str) -> str:
    """Validate and normalize a sandbox file path."""
    normalized = path.strip().replace("\\", "/")
    if not normalized:
        raise HTTPException(status_code=400, detail="Path is required")

    pure = PurePosixPath(normalized)
    if not pure.is_absolute():
        raise HTTPException(status_code=400, detail="Path must be absolute")

    for part in pure.parts:
        if part == "/":
            continue
        if part in ("", ".", ".."):
            raise HTTPException(status_code=400, detail=f"Path contains invalid segments: {path!r}")

    root = _WORKDIR_ROOT
    result = pure.as_posix()

    if root != "/" and result != root and not result.startswith(f"{root}/"):
        raise HTTPException(status_code=400, detail=f"Path must be inside {root}")

    return result


@router.get("/{session_id}/sandbox/files", response_model=SandboxFilesResponse)
async def list_sandbox_files(
    session_id: UUID,
    path: str = Query(default=_WORKDIR_ROOT),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SandboxFilesResponse:
    """List files in the sandbox for a given session."""
    await _validate_session_ownership(session_id, user, db)

    manager = await _get_manager(session_id)
    sandbox_id = await manager.get_sandbox_id()
    if not sandbox_id:
        return SandboxFilesResponse(files=[], sandbox_active=False)

    validated_path = _validate_sandbox_path(path)

    try:
        raw_files = await manager.list_files_readonly(sandbox_id, validated_path)
    except Exception as exc:
        logger.exception("Failed to list sandbox files for session %s", session_id)
        # Detect stopped/unreachable sandbox — tell frontend it's not active
        exc_msg = str(exc).lower()
        if "no ip address found" in exc_msg or "is the sandbox started" in exc_msg:
            return SandboxFilesResponse(files=[], sandbox_active=False)
        return SandboxFilesResponse(files=[], sandbox_active=True)

    return SandboxFilesResponse(
        files=[SandboxFileInfo(name=f.name, path=f.path, is_dir=f.is_dir, size=f.size) for f in raw_files],
        sandbox_active=True,
    )


@router.get("/{session_id}/sandbox/file/content")
async def get_sandbox_file_content(
    session_id: UUID,
    path: str = Query(..., description="Absolute file path in the sandbox"),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    """Serve a file from the sandbox with correct Content-Type.

    Useful for displaying images, downloading artifacts, etc.
    """
    await _validate_session_ownership(session_id, user, db)

    manager = await _get_manager(session_id)
    sandbox_id = await manager.get_sandbox_id()
    if not sandbox_id:
        raise HTTPException(status_code=404, detail="No sandbox active for this session")

    validated_path = _validate_sandbox_path(path)

    try:
        file_bytes = await manager.read_file_bytes_readonly(sandbox_id, validated_path)
    except Exception as exc:
        logger.exception("Failed to read sandbox file %s for session %s", validated_path, session_id)
        exc_msg = str(exc).lower()
        if "no ip address found" in exc_msg or "is the sandbox started" in exc_msg:
            raise HTTPException(status_code=409, detail="Sandbox is stopped — start it first")
        raise HTTPException(status_code=404, detail="File not found or unreadable")

    if len(file_bytes) > _MAX_SERVE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    content_type, _ = mimetypes.guess_type(validated_path)
    if not content_type:
        content_type = "application/octet-stream"

    filename = PurePosixPath(validated_path).name
    # Sanitize filename for Content-Disposition header to prevent header injection
    safe_filename = filename.replace('"', "").replace("\n", "").replace("\r", "")
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_filename}"',
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
        },
    )


@router.get("/{session_id}/sandbox/preview", response_model=SandboxPreviewResponse)
async def get_sandbox_preview(
    session_id: UUID,
    port: int = Query(..., ge=1, le=65535, description="Port number to preview"),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SandboxPreviewResponse:
    """Get a browser-accessible preview URL for a port in the sandbox."""
    await _validate_session_ownership(session_id, user, db)

    manager = await _get_manager(session_id)
    sandbox_id = await manager.get_sandbox_id()
    if not sandbox_id:
        raise HTTPException(status_code=404, detail="No sandbox active for this session")

    try:
        preview = await manager.get_preview_url_readonly(sandbox_id, port)
    except Exception:
        logger.exception("Failed to get preview URL for session %s port %d", session_id, port)
        raise HTTPException(status_code=500, detail="Failed to get preview URL")

    return SandboxPreviewResponse(url=preview.url, port=preview.port)
