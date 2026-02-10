"""REST API endpoints for user memory management."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.configs import configs
from app.core.memory.service import get_memory_service
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["memories"])


class MemoryItem(BaseModel):
    key: str
    content: str
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=list[MemoryItem])
async def list_memories(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: str = Depends(get_current_user),
) -> list[MemoryItem]:
    """List all memories for the authenticated user."""
    memory_service = get_memory_service()
    if not memory_service or not memory_service.store:
        return []

    namespace = (configs.Memory.NamespacePrefix, user)
    items = await memory_service.store.asearch(namespace, limit=limit, offset=offset)
    return [
        MemoryItem(
            key=item.key,
            content=item.value.get("content", str(item.value)),
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


@router.delete("/{key}", status_code=204)
async def delete_memory(
    key: str,
    user: str = Depends(get_current_user),
) -> None:
    """Delete a specific memory by key."""
    memory_service = get_memory_service()
    if not memory_service or not memory_service.store:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    namespace = (configs.Memory.NamespacePrefix, user)
    await memory_service.store.adelete(namespace, key)
