"""
Message formatting and construction helpers for chat service.
"""

from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import Agent


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
    from app.repos.agent import AgentRepository

    agent_repo = AgentRepository(db)
    mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

    if not mcp_servers:
        return False

    return any(s.name == "DynamicMCPServer" or "dynamic_mcp_server" in (s.url or "").lower() for s in mcp_servers)


async def build_system_prompt(db: AsyncSession, agent: Optional[Agent], model_name: str | None) -> str:
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

    if agent and agent.knowledge_set_id:
        knowledge_instruction = (
            f"\nCurrent working directory(knowledge base) is set to '{agent.knowledge_set_id}' "
            "you should pass the folder name while calling knowledge tools (list_files, read_file, etc.)."
        )
        base_prompt += knowledge_instruction

    if model_name and "image" in model_name:
        formatting_instructions = ""
    else:
        formatting_instructions = """
    Please format your output using Markdown.
    When writing code, use triple backticks with the language identifier (e.g. ```python).
    If you generate HTML that should be previewed, use ```html.
    If you generate ECharts JSON options, use ```echart.
    """

    return f"{base_prompt}\n{formatting_instructions}"
