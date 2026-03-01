"""REST API endpoints for user memory management."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.configs import configs
from app.core.memory.schemas import CORE_MEMORY_SECTIONS
from app.core.memory.service import get_memory_service
from app.middleware.auth import get_current_user

if TYPE_CHECKING:
    from langgraph.store.base import Item

logger = logging.getLogger(__name__)

router = APIRouter(tags=["memories"])


# ---------------------------------------------------------------------------
# Shared response / request models
# ---------------------------------------------------------------------------


class MemoryItem(BaseModel):
    key: str
    content: str
    created_at: datetime
    updated_at: datetime


class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class MemoryUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CoreMemoryResponse(BaseModel):
    user_summary: str = ""
    preferences: str = ""
    active_context: str = ""
    working_rules: str = ""


class CoreMemoryFullUpdate(BaseModel):
    user_summary: str = Field(default="", max_length=500)
    preferences: str = Field(default="", max_length=500)
    active_context: str = Field(default="", max_length=500)
    working_rules: str = Field(default="", max_length=500)


class CoreMemorySectionUpdate(BaseModel):
    content: str = Field(..., max_length=500)


class MemorySearchRequest(BaseModel):
    query: str = ""
    limit: int = Field(default=20, ge=1, le=200)


def _get_store():
    memory_service = get_memory_service()
    if not memory_service or not memory_service.store:
        raise HTTPException(status_code=503, detail="Memory service unavailable")
    return memory_service.store


def _to_memory_item(item: Item) -> MemoryItem:
    raw = item.value.get("content", item.value)
    # langmem may nest content as {"content": "..."} — unwrap if needed
    if isinstance(raw, dict):
        raw = raw.get("content", str(raw))
    return MemoryItem(
        key=item.key,
        content=str(raw),
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


# ---------------------------------------------------------------------------
# Core Memory endpoints
# ---------------------------------------------------------------------------


@router.get("/core", response_model=CoreMemoryResponse)
async def get_core_memory(
    user: str = Depends(get_current_user),
) -> CoreMemoryResponse:
    """Get the current core memory profile for the authenticated user."""
    memory_service = get_memory_service()
    if not memory_service:
        return CoreMemoryResponse()

    block = await memory_service.get_core_memory(user)
    return CoreMemoryResponse(
        user_summary=block.user_summary,
        preferences=block.preferences,
        active_context=block.active_context,
        working_rules=block.working_rules,
    )


@router.put("/core", response_model=CoreMemoryResponse)
async def update_core_memory_full(
    body: CoreMemoryFullUpdate,
    user: str = Depends(get_current_user),
) -> CoreMemoryResponse:
    """Replace the entire core memory profile."""
    memory_service = get_memory_service()
    if not memory_service:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    from app.core.memory.schemas import CoreMemoryBlock

    block = CoreMemoryBlock(
        user_summary=body.user_summary,
        preferences=body.preferences,
        active_context=body.active_context,
        working_rules=body.working_rules,
    )
    updated = await memory_service.update_core_memory_full(user, block)
    return CoreMemoryResponse(
        user_summary=updated.user_summary,
        preferences=updated.preferences,
        active_context=updated.active_context,
        working_rules=updated.working_rules,
    )


@router.patch("/core/{section}", response_model=CoreMemoryResponse)
async def update_core_memory_section(
    section: str,
    body: CoreMemorySectionUpdate,
    user: str = Depends(get_current_user),
) -> CoreMemoryResponse:
    """Update a single section of the core memory profile."""
    if section not in CORE_MEMORY_SECTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid section '{section}'. Must be one of: {', '.join(CORE_MEMORY_SECTIONS)}",
        )

    memory_service = get_memory_service()
    if not memory_service:
        raise HTTPException(status_code=503, detail="Memory service unavailable")

    updated = await memory_service.update_core_memory_section(user, section, body.content)
    return CoreMemoryResponse(
        user_summary=updated.user_summary,
        preferences=updated.preferences,
        active_context=updated.active_context,
        working_rules=updated.working_rules,
    )
