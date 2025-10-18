from typing import List, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.auth import get_current_user
from middleware.database import get_session
from models.agent import Agent, AgentCreate, AgentRead, AgentUpdate
from models.mcp import McpServer
from repository.provider_repository import ProviderRepository

router = APIRouter()


@router.post("/", response_model=AgentRead)
async def create_agent(
    agent: AgentCreate, db: AsyncSession = Depends(get_session), current_user_id: str = Depends(get_current_user)
) -> Agent:
    mcp_server_ids = agent.mcp_server_ids
    del agent.mcp_server_ids

    # 创建 agent 数据，设置真实的用户ID
    agent_data = agent.model_dump(exclude={"mcp_server_ids"})
    agent_data["user_id"] = current_user_id

    # Validate provider_id if provided
    if agent_data.get("provider_id"):
        provider_repo = ProviderRepository(db)
        provider = await provider_repo.get_provider_by_id(agent_data["provider_id"], user_id=current_user_id)
        if not provider:
            raise HTTPException(status_code=400, detail="Provider not found or does not belong to you")

    db_agent = Agent.model_validate(agent_data)

    if mcp_server_ids:
        mcp_result = await db.exec(select(McpServer).where(col(McpServer.id).in_(mcp_server_ids)))
        mcp_servers = mcp_result.all()
        db_agent.mcp_servers = list(mcp_servers)

    db.add(db_agent)
    await db.commit()
    await db.refresh(db_agent)
    return db_agent


@router.get("/", response_model=List[AgentRead])
async def get_agents(
    db: AsyncSession = Depends(get_session), current_user_id: str = Depends(get_current_user)
) -> Sequence[Agent]:
    # 只返回当前用户的 agents
    statement = (
        select(Agent).where(Agent.user_id == current_user_id).options(selectinload(getattr(Agent, "mcp_servers")))
    )
    result = await db.exec(statement)
    agents = result.all()
    return agents


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(
    agent_id: UUID, db: AsyncSession = Depends(get_session), current_user_id: str = Depends(get_current_user)
) -> Agent:
    # 只能获取当前用户的 agent
    statement = (
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == current_user_id)
        .options(selectinload(getattr(Agent, "mcp_servers")))
    )
    result = await db.exec(statement)
    agent = result.one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: UUID,
    agent: AgentUpdate,
    db: AsyncSession = Depends(get_session),
    current_user_id: str = Depends(get_current_user),
) -> Agent:
    # 只能更新当前用户的 agent
    statement = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user_id)
    result = await db.exec(statement)
    db_agent = result.one_or_none()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_data = agent.model_dump(exclude_unset=True)

    # Validate provider_id if being updated
    if "provider_id" in agent_data and agent_data["provider_id"] is not None:
        provider_repo = ProviderRepository(db)
        # Check if it's user's provider
        provider = await provider_repo.get_provider_by_id(agent_data["provider_id"], user_id=current_user_id)

        # If not found, check if it's the system provider
        if not provider:
            system_provider = await provider_repo.get_system_provider()
            if system_provider and system_provider.id == agent_data["provider_id"]:
                provider = system_provider

        # If still not found, reject
        if not provider:
            raise HTTPException(status_code=400, detail="Provider not found or does not belong to you")

    if "mcp_server_ids" in agent_data:
        mcp_server_ids = agent_data.pop("mcp_server_ids")
        if mcp_server_ids:
            mcp_result = await db.exec(select(McpServer).where(col(McpServer.id).in_(mcp_server_ids)))
            mcp_servers = mcp_result.all()
            db_agent.mcp_servers = list(mcp_servers)
        else:
            db_agent.mcp_servers = []

    for key, value in agent_data.items():
        setattr(db_agent, key, value)

    db.add(db_agent)
    await db.commit()
    await db.refresh(db_agent)
    return db_agent


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: UUID, db: AsyncSession = Depends(get_session), current_user_id: str = Depends(get_current_user)
) -> dict:
    # 只能删除当前用户的 agent
    statement = select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user_id)
    result = await db.exec(statement)
    agent = result.one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.commit()
    return {"ok": True}
