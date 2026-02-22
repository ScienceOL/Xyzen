"""User-level sandbox management API.

Provides endpoints for listing and destroying sandboxes across all sessions.
Session-scoped file browsing endpoints remain in ``sandbox.py``.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sandboxes"])


# --- Response models ---


class SandboxEntry(BaseModel):
    """One active sandbox with enriched session/agent metadata."""

    sandbox_id: str
    session_id: str
    session_name: str
    agent_id: str | None = None
    agent_name: str | None = None
    backend: str
    created_at: datetime
    ttl_seconds: int = Field(description="Remaining TTL in Redis (seconds)")


class SandboxListResponse(BaseModel):
    sandboxes: list[SandboxEntry]
    total: int


class SandboxDeleteResponse(BaseModel):
    success: bool
    sandbox_id: str | None = None


# --- Endpoints ---


@router.get("/sandboxes", response_model=SandboxListResponse)
async def list_user_sandboxes(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SandboxListResponse:
    """List all active sandboxes belonging to the current user.

    Scans Redis for sandbox entries, resolves session ownership via DB,
    and enriches with agent names.
    """
    from app.infra.sandbox.manager import REDIS_KEY_PREFIX, scan_all_sandbox_infos
    from app.repos.session import SessionRepository

    # 1. Scan all sandbox entries from Redis
    all_infos = await scan_all_sandbox_infos(configs.Redis.REDIS_URL)
    if not all_infos:
        return SandboxListResponse(sandboxes=[], total=0)

    # 2. Batch-resolve sessions: collect all session_ids
    session_repo = SessionRepository(db)
    session_ids: list[UUID] = []
    for info in all_infos:
        try:
            session_ids.append(UUID(info.session_id))
        except ValueError:
            continue

    # Fetch sessions in bulk — use the repo's single-get for now
    # (a batch query could be added to SessionRepository for optimization)
    session_map: dict[str, "SessionModel"] = {}
    agent_ids_to_resolve: set[UUID] = set()

    from app.models.sessions import Session as SessionModel

    for sid in session_ids:
        session = await session_repo.get_session_by_id(sid)
        if session and session.user_id == user:
            session_map[str(sid)] = session
            if session.agent_id:
                agent_ids_to_resolve.add(session.agent_id)

    # 3. Batch-resolve agent names
    agent_name_map: dict[str, str] = {}
    if agent_ids_to_resolve:
        from app.models.agent import Agent

        for agent_id in agent_ids_to_resolve:
            agent = await db.get(Agent, agent_id)
            if agent:
                agent_name_map[str(agent_id)] = agent.name
            else:
                # Could be a builtin agent UUID
                from app.models.sessions import uuid_to_builtin_agent_id

                builtin_id = uuid_to_builtin_agent_id(agent_id)
                if builtin_id:
                    agent_name_map[str(agent_id)] = builtin_id.removeprefix("builtin_")

    # 4. Get TTLs from Redis
    import redis.asyncio as aioredis

    redis_client = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    try:
        ttl_map: dict[str, int] = {}
        for info in all_infos:
            if info.session_id in session_map:
                key = f"{REDIS_KEY_PREFIX}{info.session_id}"
                ttl = await redis_client.ttl(key)
                ttl_map[info.session_id] = max(ttl, 0)
    finally:
        await redis_client.aclose()

    # 5. Build response
    entries: list[SandboxEntry] = []
    for info in all_infos:
        session = session_map.get(info.session_id)
        if not session:
            continue  # Not owned by this user

        agent_id_str = str(session.agent_id) if session.agent_id else None
        entries.append(
            SandboxEntry(
                sandbox_id=info.sandbox_id,
                session_id=info.session_id,
                session_name=session.name,
                agent_id=agent_id_str,
                agent_name=agent_name_map.get(agent_id_str or "", None),
                backend=info.backend,
                created_at=info.created_at,
                ttl_seconds=ttl_map.get(info.session_id, 0),
            )
        )

    # Sort by created_at descending (newest first)
    entries.sort(key=lambda e: e.created_at, reverse=True)

    return SandboxListResponse(sandboxes=entries, total=len(entries))


@router.delete("/sandboxes/{session_id}", response_model=SandboxDeleteResponse)
async def delete_sandbox(
    session_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SandboxDeleteResponse:
    """Manually destroy a sandbox for the given session.

    Validates session ownership, then delegates to SandboxManager.cleanup().
    """
    from app.repos.session import SessionRepository

    # Validate ownership
    session_repo = SessionRepository(db)
    session = await session_repo.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if sandbox exists
    from app.infra.sandbox import get_sandbox_manager

    manager = get_sandbox_manager(str(session_id), user_id=user)
    sandbox_id = await manager.get_sandbox_id()
    if not sandbox_id:
        raise HTTPException(status_code=404, detail="No active sandbox for this session")

    # Cleanup
    await manager.cleanup()
    logger.info(f"User {user} manually deleted sandbox {sandbox_id} for session {session_id}")

    return SandboxDeleteResponse(success=True, sandbox_id=sandbox_id)
