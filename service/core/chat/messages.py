"""
Message formatting and construction helpers for chat service.
"""

from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent


async def agent_has_dynamic_mcp(db: AsyncSession, agent: Optional[Agent]) -> bool:
    """
    Check if agent has the DynamicMCPServer configured.

    Args:
        db: Database session
        agent: The agent to check

    Returns:
        True if agent has DynamicMCPServer, False otherwise
    """
    if not agent:
        return False

    # Load MCP servers for the agent using AgentRepository
    from repo.agent import AgentRepository

    agent_repo = AgentRepository(db)
    mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

    if not mcp_servers:
        return False

    return any(s.name == "DynamicMCPServer" or "dynamic_mcp_server" in (s.url or "").lower() for s in mcp_servers)


async def build_system_prompt(db: AsyncSession, agent: Optional[Agent]) -> str:
    """
    Build system prompt for the agent.

    Args:
        db: Database session
        agent: The agent whose prompt to build

    Returns:
        System prompt string
    """
    # Get base prompt from agent or use default
    base_prompt = """You are a helpful AI assistant.

"""

    if agent and agent.prompt:
        base_prompt = agent.prompt

    formatting_instructions = """
Please format your output using Markdown.
When writing code, use triple backticks with the language identifier (e.g. ```python).
If you generate HTML that should be previewed, use ```html.
If you generate ECharts JSON options, use ```echart.
"""

    return f"{base_prompt}\n{formatting_instructions}"
