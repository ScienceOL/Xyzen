from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

# 使用项目中已有的数据库会话管理
from middleware.database import get_session

from models.agents import Agent, AgentCreate, AgentRead, AgentUpdate
from models.providers import Provider
from models.sessions import Session, SessionCreate, SessionRead


router = APIRouter(
    tags=["Agents and Sessions"], 
)

# --- Agent 增删查改的接口 ---

@router.post("/", response_model=AgentRead, status_code=status.HTTP_201_CREATED, summary="创建新Agent")
async def create_agent(*, session: AsyncSession = Depends(get_session), agent_in: AgentCreate) -> Agent:
    """
    创建一个新的Agent。
    创建时必须指定一个存在的 `provider_id`。
    """
    provider = await session.get(Provider, agent_in.provider_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Provider with id {agent_in.provider_id} not found"
        )
    
    db_agent = Agent.model_validate(agent_in)
    session.add(db_agent)
    await session.commit()
    await session.refresh(db_agent)
    return db_agent

@router.get("/", response_model=list[AgentRead], summary="获取所有Agent列表")
async def list_agents(
    *, 
    session: AsyncSession = Depends(get_session), 
    skip: int = 0, 
    limit: int = 100
) -> list[Agent]:
    """
    获取一个Agent列表。返回的数据将包含每个Agent关联的Provider信息。
    """
    statement = select(Agent).offset(skip).limit(limit)
    result = await session.exec(statement)
    agents = result.all()
    return list(agents) 

@router.get("/{agent_id}", response_model=AgentRead, summary="根据ID查询Agent")
async def read_agent(*, session: AsyncSession = Depends(get_session), agent_id: UUID) -> Agent:
    """
    获取指定ID的Agent的详细信息, 包括其关联的Provider。
    """
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.patch("/{agent_id}", response_model=AgentRead, summary="更新Agent信息")
async def update_agent(*, session: AsyncSession = Depends(get_session), agent_id: UUID, agent_update: AgentUpdate) -> Agent:
    """
    更新指定ID的Agent信息。如果提供了 `provider_id`，会验证其有效性。
    """
    db_agent = await session.get(Agent, agent_id)
    if not db_agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    
    update_data = agent_update.model_dump(exclude_unset=True)
    
    # 如果更新数据中包含provider_id，则需要验证
    if "provider_id" in update_data:
        provider = await session.get(Provider, update_data["provider_id"])
        if not provider:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Provider with id {update_data['provider_id']} not found"
            )

    for key, value in update_data.items():
        setattr(db_agent, key, value)
        
    session.add(db_agent)
    await session.commit()
    await session.refresh(db_agent)
    return db_agent

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除Agent")
async def delete_agent(*, session: AsyncSession = Depends(get_session), agent_id: UUID) -> None:
    """
    删除指定ID的Agent。如果Agent已关联到Session，将禁止删除。
    """
    agent = await session.get(Agent, agent_id)
    if not agent:
        
        return

    # 检查是否有会话正在使用此Agent
    statement = select(Session).where(Session.agent_id == agent_id)
    result = await session.exec(statement)
    first_session = result.first()
    if first_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Cannot delete agent: It is currently associated with one or more sessions."
        )

    await session.delete(agent)
    await session.commit()
    return


# --- Agent 与 Session 绑定的接口 ---

@router.post("/sessions/", response_model=SessionRead, status_code=status.HTTP_201_CREATED, summary="为Agent创建新会话")
async def create_session_for_agent(*, session: AsyncSession = Depends(get_session), session_in: SessionCreate) -> Session:
    """
    创建一个新的会话(Session)，并将其与一个指定的Agent进行绑定。
    这个接口实现了Agent和会话内容的绑定。
    """
    # 验证要绑定的Agent是否存在
    agent = await session.get(Agent, session_in.agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {session_in.agent_id} not found"
        )
    
    db_session = Session.model_validate(session_in)
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session