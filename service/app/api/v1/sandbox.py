"""REST API endpoint for browsing sandbox files."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.repos.session import SessionRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sandbox"])


class SandboxFileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None


class SandboxFilesResponse(BaseModel):
    files: list[SandboxFileInfo]
    sandbox_active: bool


@router.get("/{session_id}/sandbox/files", response_model=SandboxFilesResponse)
async def list_sandbox_files(
    session_id: UUID,
    path: str = Query(default="/workspace"),
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SandboxFilesResponse:
    """List files in the sandbox for a given session.

    Returns the file listing at the specified path. If no sandbox exists
    for the session, returns an empty list with sandbox_active=False.
    Does NOT create a sandbox — read-only check only.
    """
    # Validate session ownership
    session_repo = SessionRepository(db)
    session = await session_repo.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check Redis for existing sandbox (don't create one)
    from app.infra.redis import get_redis_client

    redis_client = await get_redis_client()
    sandbox_id = await redis_client.get(f"sandbox:session:{session_id}")
    if not sandbox_id:
        return SandboxFilesResponse(files=[], sandbox_active=False)

    # List files using backend directly
    from app.infra.sandbox.backends import get_backend

    backend = get_backend()
    try:
        raw_files = await backend.list_files(sandbox_id, path)
    except Exception:
        logger.exception("Failed to list sandbox files for session %s", session_id)
        return SandboxFilesResponse(files=[], sandbox_active=True)

    return SandboxFilesResponse(
        files=[SandboxFileInfo(name=f.name, path=f.path, is_dir=f.is_dir, size=f.size) for f in raw_files],
        sandbox_active=True,
    )
