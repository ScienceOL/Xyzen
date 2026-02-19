"""REST API endpoints for sandbox file browsing and content serving."""

from __future__ import annotations

import logging
import mimetypes
from pathlib import PurePosixPath
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.repos.session import SessionRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sandbox"])

_MAX_SERVE_BYTES = 50 * 1024 * 1024  # 50 MB


def _configured_workdir_root() -> str:
    workdir = (configs.Sandbox.WorkDir or "/workspace").strip()
    if not workdir.startswith("/"):
        workdir = f"/{workdir}"
    return PurePosixPath(workdir).as_posix()


_WORKDIR_ROOT = _configured_workdir_root()


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


async def _get_sandbox_id(session_id: UUID) -> str | None:
    """Look up sandbox ID from Redis without creating one."""
    from app.infra.redis import get_redis_client

    redis_client = await get_redis_client()
    return await redis_client.get(f"sandbox:session:{session_id}")


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

    sandbox_id = await _get_sandbox_id(session_id)
    if not sandbox_id:
        return SandboxFilesResponse(files=[], sandbox_active=False)

    validated_path = _validate_sandbox_path(path)

    from app.infra.sandbox.backends import get_backend

    backend = get_backend()
    try:
        raw_files = await backend.list_files(sandbox_id, validated_path)
    except Exception:
        logger.exception("Failed to list sandbox files for session %s", session_id)
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

    sandbox_id = await _get_sandbox_id(session_id)
    if not sandbox_id:
        raise HTTPException(status_code=404, detail="No sandbox active for this session")

    validated_path = _validate_sandbox_path(path)

    from app.infra.sandbox.backends import get_backend

    backend = get_backend()
    try:
        file_bytes = await backend.read_file_bytes(sandbox_id, validated_path)
    except Exception:
        logger.exception("Failed to read sandbox file %s for session %s", validated_path, session_id)
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

    sandbox_id = await _get_sandbox_id(session_id)
    if not sandbox_id:
        raise HTTPException(status_code=404, detail="No sandbox active for this session")

    from app.infra.sandbox.backends import get_backend

    backend = get_backend()
    try:
        preview = await backend.get_preview_url(sandbox_id, port)
    except Exception:
        logger.exception("Failed to get preview URL for session %s port %d", session_id, port)
        raise HTTPException(status_code=500, detail="Failed to get preview URL")

    return SandboxPreviewResponse(url=preview.url, port=preview.port)
