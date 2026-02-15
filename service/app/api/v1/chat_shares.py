from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCodeError, handle_auth_error
from app.core.chat_share import ChatShareService
from app.core.fga.client import FgaClient
from app.infra.database import get_session
from app.middleware.auth import get_current_user, get_current_user_optional
from app.models.chat_share import ChatShareCreate, ChatSharePublicRead, ChatShareRead

router = APIRouter(tags=["chat-shares"])


class ForkResponse(BaseModel):
    session_id: UUID
    topic_id: UUID
    agent_id: UUID


async def _get_fga() -> FgaClient | None:
    try:
        from app.core.fga.client import get_fga_client

        return await get_fga_client()
    except Exception:
        return None


@router.post("/", response_model=ChatShareRead)
async def create_share(
    data: ChatShareCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ChatShareRead:
    """Create a shareable link for a chat conversation."""
    try:
        svc = ChatShareService(db)
        return await svc.create_share(user_id, data)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.get("/", response_model=list[ChatShareRead])
async def list_shares(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ChatShareRead]:
    """List all shares created by the current user."""
    svc = ChatShareService(db)
    return await svc.list_shares(user_id)


@router.get("/{token}", response_model=ChatSharePublicRead)
async def get_share(
    token: str,
    user_id: str | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> ChatSharePublicRead:
    """View a shared conversation (no auth required)."""
    try:
        svc = ChatShareService(db)
        return await svc.get_share_public(token)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.post("/{token}/fork", response_model=ForkResponse)
async def fork_share(
    token: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ForkResponse:
    """Fork a shared conversation to create your own copy."""
    try:
        fga = await _get_fga()
        svc = ChatShareService(db, fga=fga)
        result = await svc.fork_conversation(token, user_id)
        return ForkResponse(**result)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.delete("/{share_id}", response_model=ChatShareRead)
async def revoke_share(
    share_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ChatShareRead:
    """Revoke a share link."""
    try:
        svc = ChatShareService(db)
        return await svc.revoke_share(share_id, user_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)
