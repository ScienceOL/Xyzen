"""
Root Agent API — manages the per-user CEO (root) agent.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.system_agent import SystemAgentManager
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.agent import AgentRead, AgentUpdate
from app.repos.agent import AgentRepository
from app.repos.root_agent import RootAgentRepository

router = APIRouter(tags=["root-agent"])


class RootAgentResponse(BaseModel):
    agent: AgentRead
    root_agent_id: UUID


@router.get("/", response_model=RootAgentResponse)
async def get_root_agent(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> RootAgentResponse:
    """
    Get the current user's root (CEO) agent.
    Auto-creates one if it does not exist yet.
    """
    manager = SystemAgentManager(db)
    agent = await manager.ensure_root_agent(user_id)
    await db.commit()

    root_agent_repo = RootAgentRepository(db)
    root_record = await root_agent_repo.get_by_user_id(user_id)
    if not root_record:
        raise HTTPException(status_code=500, detail="Root agent record missing after ensure")

    return RootAgentResponse(
        agent=AgentRead.model_validate(agent),
        root_agent_id=root_record.agent_id,
    )


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_root_agent(
    agent_id: UUID,
    data: AgentUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
    """
    Update the root agent's limited fields (prompt, model, provider).
    """
    root_agent_repo = RootAgentRepository(db)
    is_root = await root_agent_repo.is_root_agent(agent_id, user_id)
    if not is_root:
        raise HTTPException(status_code=404, detail="Root agent not found")

    agent_repo = AgentRepository(db)
    updated = await agent_repo.update_agent(agent_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Agent not found")

    await db.commit()
    return AgentRead.model_validate(updated)
