"""
Agent API Handlers.

This module provides the following endpoints for agent management:
- POST /: Create a new agent.
- GET /: Get all agents for the current user.
- GET /{agent_id}: Get details for a specific agent.
- PATCH /{agent_id}: Update an existing agent.
- DELETE /{agent_id}: Delete an agent.
- GET /system/chat: Get the user's default chat agent.
- GET /system/all: Get all user default agents.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCodeError, handle_auth_error
from core.auth import AuthorizationService, get_auth_service
from core.system_agent import SystemAgentManager
from infra.database import get_session
from middleware.auth import get_current_user
from models.agent import AgentCreate, AgentRead, AgentReadWithDetails, AgentScope, AgentUpdate
from repos import AgentRepository, KnowledgeSetRepository, ProviderRepository

router = APIRouter(tags=["agents"])


@router.post("/", response_model=AgentRead)
async def create_agent(
    agent_data: AgentCreate,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentRead:
    """
    Create a new agent for the current authenticated user.

    Validates that the target provider exists and is accessible to the user
    before creating the agent. The agent will be created with the provided
    configuration and linked to the specified MCP servers.

    Args:
        agent_data: Agent creation data including provider_id and mcp_server_ids
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentRead: The newly created agent with generated ID and timestamps

    Raises:
        HTTPException: 400 if provider not found, 403 if provider access denied
    """
    if agent_data.provider_id:
        try:
            await auth_service.authorize_provider_read(agent_data.provider_id, user_id)
        except ErrCodeError as e:
            raise handle_auth_error(e)

    # Validate knowledge_set_id if provided
    if agent_data.knowledge_set_id:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(agent_data.knowledge_set_id)
        if not knowledge_set or knowledge_set.user_id != user_id or knowledge_set.is_deleted:
            raise HTTPException(status_code=400, detail="Knowledge set not found or access denied")

    # Force scope to USER for user-created agents
    agent_data.scope = AgentScope.USER

    agent_repo = AgentRepository(db)
    created_agent = await agent_repo.create_agent(agent_data, user_id)

    await db.commit()
    return AgentRead(**created_agent.model_dump())


@router.get("/", response_model=list[AgentReadWithDetails])
async def get_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentReadWithDetails]:
    """
    Get all agents for the current authenticated user.

    Returns all agents owned by the authenticated user, ordered by creation time.
    Each agent includes its basic configuration, metadata, and associated MCP servers.
    If the user has no agents, default agents will be initialized for them.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        list[AgentReadWithDetails]: list of agents owned by the user with MCP server details

    Raises:
        HTTPException: None - this endpoint always succeeds
    """
    # Ensure user has default agents if they have none
    system_manager = SystemAgentManager(db)
    await system_manager.ensure_user_default_agents(user)
    await db.commit()

    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user)

    # Load MCP servers for each agent and create AgentReadWithDetails
    agents_with_details = []
    for agent in agents:
        # Get MCP servers for this agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        agents_with_details.append(AgentReadWithDetails(**agent_dict))

    return agents_with_details


@router.get("/{agent_id}", response_model=AgentReadWithDetails)
async def get_agent(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Get a single agent by ID.

    Returns the requested agent with full configuration details including MCP servers.
    Authorization ensures the user has access to the agent (owner or system agent).

    Args:
        agent_id: UUID of the agent to fetch
        user_id: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The requested agent with MCP server details

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied
    """
    try:
        agent = await auth_service.authorize_agent_read(agent_id, user_id)

        agent_repo = AgentRepository(db)
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        return AgentReadWithDetails(**agent_dict)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.patch("/{agent_id}", response_model=AgentReadWithDetails)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Update an existing agent's properties.

    Allows modification of agent configuration including provider assignment
    and MCP server links. Authorization is handled by the dependency which
    ensures the user owns the agent.

    Args:
        agent_data: Partial update data (only provided fields will be updated)
        agent: Authorized agent instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The updated agent with new timestamps and MCP servers

    Raises:
        HTTPException: 404 if agent not found, 403 if access denied,
                      400 if provider not found, 500 if update operation fails unexpectedly
    """
    try:
        agent = await auth_service.authorize_agent_write(agent_id, user_id)

        if agent.scope == AgentScope.SYSTEM:
            raise HTTPException(status_code=403, detail="Cannot modify system agents")

        if agent_data.provider_id is not None:
            provider_repo = ProviderRepository(db)
            provider = await provider_repo.get_provider_by_id(agent_data.provider_id)
            if not provider:
                raise HTTPException(status_code=400, detail="Provider not found")
            # Check if user can access this provider (own or system)
            if provider.user_id != agent.user_id and not provider.is_system:
                raise HTTPException(status_code=403, detail="Provider access denied")

        # Validate knowledge_set_id if being updated
        if agent_data.knowledge_set_id is not None:
            knowledge_set_repo = KnowledgeSetRepository(db)
            knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(agent_data.knowledge_set_id)
            if not knowledge_set or knowledge_set.user_id != user_id or knowledge_set.is_deleted:
                raise HTTPException(status_code=400, detail="Knowledge set not found or access denied")

        agent_repo = AgentRepository(db)
        updated_agent = await agent_repo.update_agent(agent.id, agent_data)
        if not updated_agent:
            raise HTTPException(status_code=500, detail="Failed to update agent")

        await db.commit()

        # Get MCP servers for the updated agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(updated_agent.id)

        # Create agent dict with MCP servers
        agent_dict = updated_agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        return AgentReadWithDetails(**agent_dict)
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete an agent and all its associated MCP server links (cascade delete).

    This operation is idempotent - it will return 204 No Content even if the agent
    doesn't exist. MCP server links are deleted first to maintain referential integrity,
    followed by the agent itself. Authorization ensures only the agent owner
    can delete agents.

    Args:
        agent: Authorized agent instance or None if not found (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 403 if access denied
        (but NOT if agent doesn't exist - returns 204 instead)
    """
    try:
        agent = await auth_service.authorize_agent_delete(agent_id, user_id)

        if agent.scope == AgentScope.SYSTEM:
            raise HTTPException(status_code=403, detail="Cannot delete system agents")

        # Prevent deletion of default agents
        if agent.tags and any(tag.startswith("default_") for tag in agent.tags):
            raise HTTPException(status_code=403, detail="Cannot delete default agents")

        agent_repo = AgentRepository(db)
        await agent_repo.delete_agent(agent.id)
        await db.commit()
    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.get("/system/chat", response_model=AgentReadWithDetails)
async def get_system_chat_agent(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentReadWithDetails:
    """
    Get the user's default chat agent.

    Returns the user's personal copy of the "随便聊聊" agent with MCP server details.
    If it doesn't exist, it will be initialized.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        AgentReadWithDetails: The user's chat agent with MCP server details

    Raises:
        HTTPException: 404 if chat agent not found
    """
    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user)

    chat_agent = next((a for a in agents if a.tags and "default_chat" in a.tags), None)

    if not chat_agent:
        system_manager = SystemAgentManager(db)
        new_agents = await system_manager.ensure_user_default_agents(user)
        await db.commit()
        chat_agent = next((a for a in new_agents if a.tags and "default_chat" in a.tags), None)

    if not chat_agent:
        raise HTTPException(status_code=404, detail="Chat agent not found")

    # Get MCP servers for the agent
    mcp_servers = await agent_repo.get_agent_mcp_servers(chat_agent.id)

    # Create agent dict with MCP servers
    agent_dict = chat_agent.model_dump()
    agent_dict["mcp_servers"] = mcp_servers
    return AgentReadWithDetails(**agent_dict)


@router.get("/system/all", response_model=list[AgentReadWithDetails])
async def get_all_system_agents(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentReadWithDetails]:
    """
    Get all default agents for the user.

    Returns the user's personal copies of system agents with MCP server details.
    These are the agents tagged with 'default_'.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        list[AgentReadWithDetails]: list of all user default agents with MCP server details
    """
    agent_repo = AgentRepository(db)
    agents = await agent_repo.get_agents_by_user(user)

    # Filter for default agents
    default_agents = [a for a in agents if a.tags and any(t.startswith("default_") for t in a.tags)]

    if not default_agents:
        system_manager = SystemAgentManager(db)
        default_agents = await system_manager.ensure_user_default_agents(user)
        await db.commit()

    # Load MCP servers for each system agent
    agents_with_details = []

    for agent in default_agents:
        # Get MCP servers for this agent
        mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

        # Create agent dict with MCP servers
        agent_dict = agent.model_dump()
        agent_dict["mcp_servers"] = mcp_servers
        agents_with_details.append(AgentReadWithDetails(**agent_dict))

    return agents_with_details


@router.get("/avatars/available", response_model=list[dict])
async def get_available_avatars(
    user: str = Depends(get_current_user),
) -> list[dict]:
    """
    Get all available avatar options for agents.

    Returns a list of available avatar animations with their metadata including
    category and tags for filtering and categorization. These avatars are loaded
    from MinIO storage and include WebM video files.

    Args:
        user: Authenticated user ID (injected by dependency)

    Returns:
        list[dict]: List of available avatars with name, URL, category, and tags

    Raises:
        HTTPException: If authentication is missing or invalid (401 Unauthorized)
    """
    # Ensure the authenticated user is present; if not, fail securely.
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    # 定义可用的头像列表（带分类和标签）
    # 基础 URL 指向 MinIO 存储
    base_url = "https://storage.sciol.ac.cn/library/docs/public"

    avatars = [
        # 黄脸表情 (9)
        {
            "name": "smirk",
            "url": f"{base_url}/smirk-0.5x.webm",
            "category": "emoji-face",
            "tags": ["表情", "黄脸"],
        },
        {
            "name": "cold-face",
            "url": f"{base_url}/cold-face-0.5x.webm",
            "category": "emoji-face",
            "tags": ["表情", "冷脸"],
        },
        {
            "name": "yum",
            "url": f"{base_url}/yum-0.5x.webm",
            "category": "emoji-face",
            "tags": ["表情", "美味"],
        },
        {
            "name": "bandage-face",
            "url": f"{base_url}/bandage-face-0.5x.webm",
            "category": "emoji-face",
            "tags": ["表情", "绷带"],
        },
        {
            "name": "mouth-none",
            "url": f"{base_url}/mouth-none-1x.webm",
            "category": "emoji-face",
            "tags": ["表情", "无口"],
        },
        {
            "name": "pensive",
            "url": f"{base_url}/pensive-0.5x.mp4",
            "category": "emoji-face",
            "tags": ["表情", "沮丧"],
        },
        {
            "name": "scrunched-eyes",
            "url": f"{base_url}/scrunched-eyes-0.5x.mp4",
            "category": "emoji-face",
            "tags": ["表情", "眯眼"],
        },
        {
            "name": "zany-face",
            "url": f"{base_url}/zany-face-0.5x.webm",
            "category": "emoji-face",
            "tags": ["表情", "疯狂"],
        },
        {
            "name": "zipper-face",
            "url": f"{base_url}/zipper-face-1x.webm",
            "category": "emoji-face",
            "tags": ["表情", "拉链嘴"],
        },
        # 动物 (1)
        {
            "name": "rat",
            "url": f"{base_url}/rat-0.5x.webm",
            "category": "animal",
            "tags": ["动物", "啮齿"],
        },
        # 交通工具 (1)
        {
            "name": "airplane",
            "url": f"{base_url}/airplane-departure-2x.webm",
            "category": "transportation",
            "tags": ["交通", "飞机"],
        },
        # 日常用品 (5)
        {
            "name": "alarm",
            "url": f"{base_url}/alarm-clock-1x.mp4",
            "category": "daily",
            "tags": ["用品", "时间", "闹钟"],
        },
        {
            "name": "light-bulb",
            "url": f"{base_url}/light-bulb-2x.webm",
            "category": "daily",
            "tags": ["用品", "灯泡"],
        },
        {
            "name": "maracas",
            "url": f"{base_url}/maracas-0.5x.webm",
            "category": "daily",
            "tags": ["用品", "乐器"],
        },
        {
            "name": "money-with-wings",
            "url": f"{base_url}/money-with-wings-0.5x.webm",
            "category": "daily",
            "tags": ["用品", "金钱"],
        },
        {
            "name": "wine-glass",
            "url": f"{base_url}/wine-glass-1x.webm",
            "category": "daily",
            "tags": ["用品", "酒杯"],
        },
        # 人物角色 (3)
        {
            "name": "robot",
            "url": f"{base_url}/robot-0.5x.webm",
            "category": "character",
            "tags": ["角色", "机器人"],
        },
        {
            "name": "alien",
            "url": f"{base_url}/alien-0.5x.webm",
            "category": "character",
            "tags": ["角色", "外星人"],
        },
        {
            "name": "dancer-woman",
            "url": f"{base_url}/dancer-woman-skin-tone-3-0.5x.webm",
            "category": "character",
            "tags": ["角色", "舞者"],
        },
        # 手势 (4)
        {
            "name": "clap-skin-tone",
            "url": f"{base_url}/clap-skin-tone-1-0.5x.mp4",
            "category": "gesture",
            "tags": ["手势", "鼓掌"],
        },
        {
            "name": "crossed-fingers-skin",
            "url": f"{base_url}/crossed-fingers-skin-tone-4-0.5x.webm",
            "category": "gesture",
            "tags": ["手势", "交叉手指"],
        },
        {
            "name": "thumbs-up",
            "url": f"{base_url}/thumbs-up-skin-tone-2-0.5x.webm",
            "category": "gesture",
            "tags": ["手势", "点赞"],
        },
        {
            "name": "victory",
            "url": f"{base_url}/victory-skin-tone-3-0.5x.webm",
            "category": "gesture",
            "tags": ["手势", "胜利"],
        },
        # 自然元素 (1)
        {
            "name": "fire",
            "url": f"{base_url}/fire-0.5x.webm",
            "category": "nature",
            "tags": ["自然", "火焰"],
        },
        # 其他 (2)
        {
            "name": "eye",
            "url": f"{base_url}/eyes-0.5x.webm",
            "category": "other",
            "tags": ["其他", "眼睛"],
        },
        {
            "name": "biting-lip",
            "url": f"{base_url}/biting-lip-0.5x.webm",
            "category": "other",
            "tags": ["其他", "嘴唇"],
        },
    ]

    return avatars
