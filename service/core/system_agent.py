"""
System Agent Manager

Manages system-wide default agents that are available to all users.
Creates and maintains the Chat Agent with distinct personalities.
"""

import logging
from typing import TypedDict
from uuid import UUID

from sqlmodel import select
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
        "avatar": "/defaults/agents/avatar1.png",
        "tags": ["助手", "对话", "工具", "帮助"],
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

    async def ensure_user_default_agents(self, user_id: str) -> list[Agent]:
        """
        Check and ensure user has all default agents by verifying tags.
        If a specific default agent is missing, it will be recreated.

        Args:
            user_id: The ID of the user to initialize defaults for.

        Returns:
            List of newly created default agents for the user.
        """
        # Fetch existing agents for the user to check tags
        statement = select(Agent).where(Agent.user_id == user_id)
        result = await self.db.exec(statement)
        existing_agents = result.all()
        existing_tags = set()
        for agent in existing_agents:
            if agent.tags:
                existing_tags.update(agent.tags)

        logger.info(f"Checking default agents for user: {user_id}")

        # Get system provider to set as default if available
        system_provider = await self.provider_repo.get_system_provider()

        created_agents = []
        for agent_key, config in SYSTEM_AGENTS.items():
            tag = f"default_{agent_key}"
            if tag in existing_tags:
                continue

            # Add a tag to identify which default agent this is
            tags = config.get("tags", [])
            if tag not in tags:
                tags = tags + [tag]

            agent_data = AgentCreate(
                scope=AgentScope.USER,
                name=config["name"],
                description=config["description"],
                prompt=config["prompt"],
                avatar=config.get("avatar"),
                tags=tags,
                provider_id=system_provider.id if system_provider else None,
                mcp_server_ids=[],  # Defaults start clean
                require_tool_confirmation=False,
                model=None,
                temperature=0.7,
            )

            agent = await self.agent_repo.create_agent(agent_data, user_id)
            created_agents.append(agent)
            logger.info(f"Created default {agent_key} agent for user {user_id}: {agent.id}")

        return created_agents

    async def ensure_system_agents(self) -> dict[str, Agent]:
        """
        Legacy: Create or update system agents.
        Now primarily used for global/template reference if needed.
        """
        logger.info("Ensuring system reference agents exist...")

        system_provider = await self.provider_repo.get_system_provider()
        created_agents: dict[str, Agent] = {}

        for agent_key, agent_config in SYSTEM_AGENTS.items():
            try:
                # Check if agent already exists by name and scope
                existing = await self.agent_repo.get_agent_by_name_and_scope(agent_config["name"], AgentScope.SYSTEM)

                if existing:
                    agent = await self._update_system_agent(existing, agent_config, system_provider)
                else:
                    logger.info(f"Creating new system reference agent: {agent_config['name']}")
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
                        model=None,
                        temperature=0.7,
                    )
                    agent = await self.agent_repo.create_agent(agent_data, SYSTEM_USER_ID)

                created_agents[agent_key] = agent
            except Exception as e:
                logger.error(f"Failed to handle system agent '{agent_key}': {e}")
                continue

        return created_agents

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
            agent_personality: Personality type ('friendly_assistant')

        Returns:
            List of MCP server UUIDs
        """
        # TODO: Implement MCP server assignment based on personality
        # For now, return empty list - can be enhanced later

        if agent_personality == "friendly_assistant":
            # Chat agent: basic utility tools
            return await self._get_basic_mcp_servers()

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

    async def get_system_agent(self, agent_type: str) -> Agent | None:
        """
        Get a specific system agent by type.

        Args:
            agent_type: 'chat'

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
