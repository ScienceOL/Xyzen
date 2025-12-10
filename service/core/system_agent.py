"""
System Agent Manager

Manages system-wide default agents that are available to all users.
Creates and maintains the Chat Agent and Workshop Agent with distinct personalities.
"""

import logging
from typing import TypedDict
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from core.providers import SYSTEM_USER_ID
from models.agent import Agent, AgentCreate, AgentScope
from models.provider import Provider
from repos.agent import AgentRepository
from repos.provider import ProviderRepository

logger = logging.getLogger(__name__)


class AgentConfig(TypedDict):
    name: str
    description: str
    prompt: str
    personality: str
    capabilities: list[str]
    avatar: str
    tags: list[str]


# System agent configurations
SYSTEM_AGENTS: dict[str, AgentConfig] = {
    "chat": {
        "name": "随便聊聊",
        "description": "与AI助手自由对话，获得各种帮助和支持",
        "prompt": """你是一个友好、有用的AI助手。你可以回答问题、提供建议、协助完成各种任务。

特点：
- 保持对话自然流畅，积极主动地帮助用户
- 可以使用各种工具来提供更好的帮助
- 对用户的问题给出准确、有用的回答
- 在不确定时会诚实地说明，并尝试提供替代方案

你的目标是成为用户最可靠的AI助手，帮助他们解决问题并提供有价值的信息。""",
        "personality": "friendly_assistant",
        "capabilities": ["general_chat", "qa", "assistance", "tools"],
        "avatar": "https://avatars.githubusercontent.com/u/176685?v=4",
        "tags": ["助手", "对话", "工具", "帮助"],
    },
    "workshop": {
        "name": "创作工坊",
        "description": "专注于AI助手的设计、创建和优化的专业助手",
        "prompt": """你是一个专业的AI助手设计师和创作顾问。你专门帮助用户设计、创建和优化AI助手。

专业能力：
- 深入了解各种AI能力和工具集成方案
- 熟悉对话设计模式和用户体验最佳实践
- 能够分析需求并提供专业的架构建议
- 指导用户进行提示词工程和角色设定

工作方式：
- 通过提问来深入了解用户的具体需求
- 提供结构化的设计建议和实施步骤
- 推荐合适的工具和能力组合
- 帮助优化现有助手的表现

你的目标是帮助用户创建出色的AI助手，提供专业指导和创意灵感。""",
        "personality": "creative_mentor",
        "capabilities": ["agent_design", "tool_selection", "prompt_engineering", "workflow_optimization"],
        "avatar": "https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png",
        "tags": ["设计", "创作", "优化", "专业"],
    },
}


class SystemAgentManager:
    """
    Manager for system-wide default agents.

    Handles creation, updates, and maintenance of system agents
    that are available to all users.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.agent_repo = AgentRepository(db)
        self.provider_repo = ProviderRepository(db)

    async def ensure_system_agents(self) -> dict[str, Agent]:
        """
        Create or update both system agents on startup.

        Returns:
            Dictionary mapping agent keys to Agent instances
        """
        logger.info("Ensuring system agents exist...")

        # Get system provider for both agents
        system_provider = await self.provider_repo.get_system_provider()
        if not system_provider:
            logger.warning("No system provider found - system agents will use user providers")

        created_agents: dict[str, Agent] = {}

        for agent_key, agent_config in SYSTEM_AGENTS.items():
            try:
                agent = await self._ensure_single_agent(agent_config, system_provider)
                created_agents[agent_key] = agent
                logger.info(f"System agent '{agent_key}' ready: {agent.name} (ID: {agent.id})")
            except Exception as e:
                logger.error(f"Failed to create system agent '{agent_key}': {e}")
                continue

        logger.info(f"System agent initialization complete: {len(created_agents)}/{len(SYSTEM_AGENTS)} agents ready")
        return created_agents

    async def _ensure_single_agent(self, agent_config: AgentConfig, system_provider: "Provider | None") -> Agent:
        """
        Create or update a single system agent.

        Args:
            agent_config: Agent configuration dictionary
            system_provider: System provider instance or None

        Returns:
            Agent instance
        """
        # Check if agent already exists by name and scope
        existing = await self.agent_repo.get_agent_by_name_and_scope(agent_config["name"], AgentScope.SYSTEM)

        if existing:
            # Update existing agent if needed
            updated = await self._update_system_agent(existing, agent_config, system_provider)
            return updated
        else:
            # Create new system agent
            created = await self._create_system_agent(agent_config, system_provider)
            return created

    async def _create_system_agent(self, agent_config: AgentConfig, system_provider: "Provider | None") -> Agent:
        """
        Create a new system agent.

        Args:
            agent_config: Agent configuration dictionary
            system_provider: System provider instance or None

        Returns:
            Newly created Agent instance
        """
        logger.info(f"Creating new system agent: {agent_config['name']}")

        # Get default MCP servers for this agent type
        mcp_server_ids = await self._get_default_mcp_servers(agent_config["personality"])

        agent_data = AgentCreate(
            scope=AgentScope.SYSTEM,
            name=agent_config["name"],
            description=agent_config["description"],
            prompt=agent_config["prompt"],
            avatar=agent_config.get("avatar"),
            tags=agent_config.get("tags"),
            provider_id=system_provider.id if system_provider else None,
            mcp_server_ids=mcp_server_ids,
            require_tool_confirmation=False,
            model=None,  # Will use provider default
            temperature=0.7,  # Balanced creativity
        )

        # Create agent
        created_agent = await self.agent_repo.create_agent(agent_data, SYSTEM_USER_ID)

        logger.info(f"Created system agent: {created_agent.name} (ID: {created_agent.id})")
        return created_agent

    async def _update_system_agent(
        self, existing: Agent, agent_config: AgentConfig, system_provider: "Provider | None"
    ) -> Agent:
        """
        Update existing system agent if configuration has changed.

        Args:
            existing: Existing Agent instance
            agent_config: New agent configuration
            system_provider: System provider instance or None

        Returns:
            Updated Agent instance
        """
        # Check if update is needed
        needs_update = (
            existing.name != agent_config["name"]
            or existing.description != agent_config["description"]
            or existing.prompt != agent_config["prompt"]
            or existing.avatar != agent_config.get("avatar")
            or existing.tags != agent_config.get("tags")
            or existing.provider_id != (system_provider.id if system_provider else None)
        )

        if not needs_update:
            logger.debug(f"System agent '{agent_config['name']}' is up to date")
            return existing

        logger.info(f"Updating system agent: {agent_config['name']}")

        # Update agent fields
        existing.name = agent_config["name"]
        existing.description = agent_config["description"]
        existing.prompt = agent_config["prompt"]
        existing.avatar = agent_config.get("avatar")
        existing.tags = agent_config.get("tags")
        existing.provider_id = system_provider.id if system_provider else None

        # Save changes
        self.db.add(existing)
        await self.db.flush()
        await self.db.refresh(existing)

        logger.info(f"Updated system agent: {existing.name}")
        return existing

    async def _get_default_mcp_servers(self, agent_personality: str) -> list[UUID]:
        """
        Get default MCP servers for each agent personality.

        Args:
            agent_personality: Personality type ('friendly_assistant' or 'creative_mentor')

        Returns:
            List of MCP server UUIDs
        """
        # TODO: Implement MCP server assignment based on personality
        # For now, return empty list - can be enhanced later

        if agent_personality == "friendly_assistant":
            # Chat agent: basic utility tools
            return await self._get_basic_mcp_servers()
        elif agent_personality == "creative_mentor":
            # Workshop agent: creation and design tools
            return await self._get_workshop_mcp_servers()

        return []

    async def _get_basic_mcp_servers(self) -> list[UUID]:
        """
        Get basic MCP servers for general chat assistant.

        Returns:
            List of basic MCP server UUIDs
        """
        # TODO: Query for basic MCP servers (file operations, web search, etc.)
        # For now, return empty list - can be enhanced with actual MCP servers
        return []

    async def _get_workshop_mcp_servers(self) -> list[UUID]:
        """
        Get workshop-focused MCP servers for creation assistant.

        Returns:
            List of workshop MCP server UUIDs
        """
        # TODO: Query for workshop MCP servers (design tools, templates, etc.)
        # For now, return empty list - can be enhanced with actual MCP servers
        return []

    async def get_system_agent(self, agent_type: str) -> Agent | None:
        """
        Get a specific system agent by type.

        Args:
            agent_type: Either 'chat' or 'workshop'

        Returns:
            Agent instance or None if not found
        """
        if agent_type not in SYSTEM_AGENTS:
            return None

        agent_name = SYSTEM_AGENTS[agent_type]["name"]
        return await self.agent_repo.get_agent_by_name_and_scope(agent_name, AgentScope.SYSTEM)

    async def get_all_system_agents(self) -> list[Agent]:
        """
        Get all system agents.

        Returns:
            List of all system Agent instances
        """
        return list(await self.agent_repo.get_system_agents())

    async def is_system_agent(self, agent_id: UUID) -> bool:
        """
        Check if an agent ID belongs to a system agent.

        Args:
            agent_id: Agent UUID to check

        Returns:
            True if it's a system agent, False otherwise
        """
        agent = await self.agent_repo.get_agent_by_id(agent_id)
        return agent is not None and agent.scope == AgentScope.SYSTEM

    async def get_system_agent_ids(self) -> list[UUID]:
        """
        Get all system agent IDs.

        Returns:
            List of system agent UUIDs
        """
        agents = await self.agent_repo.get_system_agents()
        return [agent.id for agent in agents]


# Export constants for use in other modules
__all__ = [
    "SystemAgentManager",
    "SYSTEM_AGENTS",
]
