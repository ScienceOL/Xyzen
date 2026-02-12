"""REST API endpoints for user memory management."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.configs import configs
from app.core.memory.service import get_memory_service
from app.middleware.auth import get_current_user

if TYPE_CHECKING:
    from langgraph.store.base import Item

logger = logging.getLogger(__name__)

router = APIRouter(tags=["memories"])


class MemoryItem(BaseModel):
    key: str
    content: str
    created_at: datetime
    updated_at: datetime


class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class MemoryUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class MemorySearchRequest(BaseModel):
    query: str = ""
    limit: int = Field(default=20, ge=1, le=200)


def _get_store():
    memory_service = get_memory_service()
    if not memory_service or not memory_service.store:
        raise HTTPException(status_code=503, detail="Memory service unavailable")
    return memory_service.store


def _to_memory_item(item: Item) -> MemoryItem:
    return MemoryItem(
        key=item.key,
        content=item.value.get("content", str(item.value)),
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


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
    try:
        items = await memory_service.store.asearch(namespace, limit=limit, offset=offset)
    except Exception:
        logger.exception("Failed to search memories for user %s", user)
        raise HTTPException(status_code=503, detail="Memory service temporarily unavailable")
    return [_to_memory_item(item) for item in items]


@router.post("", response_model=MemoryItem, status_code=201)
async def create_memory(
    body: MemoryCreate,
    user: str = Depends(get_current_user),
) -> MemoryItem:
    """Create a new memory."""
    store = _get_store()
    namespace = (configs.Memory.NamespacePrefix, user)
    key = uuid4().hex
    await store.aput(namespace, key, {"content": body.content})
    item = await store.aget(namespace, key)
    if item is None:
        raise HTTPException(status_code=500, detail="Failed to create memory")
    return _to_memory_item(item)


@router.put("/{key}", response_model=MemoryItem)
async def update_memory(
    key: str,
    body: MemoryUpdate,
    user: str = Depends(get_current_user),
) -> MemoryItem:
    """Update an existing memory."""
    store = _get_store()
    namespace = (configs.Memory.NamespacePrefix, user)
    existing = await store.aget(namespace, key)
    if existing is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    await store.aput(namespace, key, {"content": body.content})
    item = await store.aget(namespace, key)
    if item is None:
        raise HTTPException(status_code=500, detail="Failed to update memory")
    return _to_memory_item(item)


@router.post("/search", response_model=list[MemoryItem])
async def search_memories(
    body: MemorySearchRequest,
    user: str = Depends(get_current_user),
) -> list[MemoryItem]:
    """Search memories using semantic search."""
    store = _get_store()
    namespace = (configs.Memory.NamespacePrefix, user)
    query = body.query.strip() if body.query else ""
    items = await store.asearch(
        namespace,
        query=query or None,
        limit=body.limit,
    )
    return [_to_memory_item(item) for item in items]


@router.delete("/{key}", status_code=204)
async def delete_memory(
    key: str,
    user: str = Depends(get_current_user),
) -> None:
    """Delete a specific memory by key."""
    store = _get_store()
    namespace = (configs.Memory.NamespacePrefix, user)
    try:
        await store.adelete(namespace, key)
    except Exception:
        logger.exception("Failed to delete memory %s for user %s", key, user)
        raise HTTPException(status_code=503, detail="Memory service temporarily unavailable")
