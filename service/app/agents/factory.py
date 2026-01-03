"""
Agent Factory - Creates agents for chat conversations.

This module provides factory functions to instantiate the appropriate agent
based on session configuration, agent type, and other parameters.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from langgraph.graph.state import CompiledStateGraph
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from uuid import UUID

    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

    from app.core.providers import ProviderManager
    from app.models.agent import Agent
    from app.models.sessions import Session
    from app.models.topic import Topic as TopicModel

logger = logging.getLogger(__name__)


async def create_chat_agent(
    db: AsyncSession,
    agent_config: Agent | None,
    topic: TopicModel,
    user_provider_manager: ProviderManager,
    provider_id: str | None,
    model_name: str | None,
    system_prompt: str,
) -> CompiledStateGraph:
    """
    Create the appropriate agent for a chat session.

    This factory function determines which agent type to use based on
    the configuration and instantiates it with the necessary parameters.

    Args:
        db: Database session
        agent_config: Agent configuration from database (optional)
        topic: Topic/conversation context
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use
        system_prompt: System prompt for the agent

    Returns:
        Compiled StateGraph ready for streaming execution

    Future Enhancement:
        Support for different agent types based on agent_config.agent_type:
        - "react" (default): Standard ReAct agent
        - "plan_and_execute": Planning agent
        - "custom_graph": DB-defined graph agent
    """
    from app.agents.react_agent import ReActAgent
    from app.core.chat.langchain_tools import prepare_langchain_tools
    from app.repos.session import SessionRepository

    # Get session for configuration
    session_repo = SessionRepository(db)
    session: Session | None = await session_repo.get_session_by_id(topic.session_id)

    # Check if built-in search is enabled
    google_search_enabled: bool = session.google_search_enabled if session else False

    # Create LangChain model WITH provider-side web search binding.
    # This ensures OpenAI gets `web_search_preview` and Gemini/Vertex gets `google_search`.
    llm: BaseChatModel = user_provider_manager.create_langchain_model(
        provider_id,
        model=model_name,
        google_search_enabled=google_search_enabled,
    )

    # Prepare tools from MCP servers
    session_id: UUID | None = topic.session_id if topic else None
    tools: list[BaseTool] = await prepare_langchain_tools(db, agent_config, session_id)

    # Determine agent type (future: read from agent_config.agent_type)
    agent_type: str = _get_agent_type(agent_config)

    # Create the appropriate agent
    if agent_type == "react":
        agent = ReActAgent(
            llm=llm,
            tools=tools,
            system_prompt=system_prompt,
            google_search_enabled=google_search_enabled,
        )
        compiled_graph: CompiledStateGraph = agent.build_graph()
        logger.info(f"Created ReAct agent with {len(tools)} tools, google_search={google_search_enabled}")
        return compiled_graph

    # Future: Add more agent types here
    # elif agent_type == "plan_and_execute":
    #     return _create_plan_and_execute_agent(...)
    # elif agent_type == "custom_graph":
    #     return await _create_custom_graph_agent(db, agent_config, ...)

    # Default fallback to ReAct
    logger.warning(f"Unknown agent type '{agent_type}', falling back to ReAct")
    agent = ReActAgent(llm=llm, tools=tools, system_prompt=system_prompt)
    return agent.build_graph()


def _get_agent_type(agent_config: Agent | None) -> str:
    """
    Determine the agent type from configuration.

    Args:
        agent_config: Agent configuration

    Returns:
        Agent type string (default: "react")
    """
    if agent_config is None:
        return "react"

    # Future: Read from agent_config.agent_type field
    # For now, always use react agent
    return "react"


async def create_agent_from_builtin(
    builtin_name: str,
    user_provider_manager: ProviderManager,
    provider_id: str | None,
    model_name: str | None,
) -> CompiledStateGraph | None:
    """
    Create an agent from the builtin registry.

    Args:
        builtin_name: Name of the builtin agent in registry
        user_provider_manager: Provider manager for LLM access
        provider_id: Provider ID to use
        model_name: Model name to use

    Returns:
        Compiled StateGraph or None if agent not found
    """
    from app.agents import registry

    agent = registry.get_agent(builtin_name)
    if agent is None:
        logger.warning(f"Builtin agent '{builtin_name}' not found in registry")
        return None

    try:
        graph: CompiledStateGraph = agent.build_graph()
        logger.info(f"Created builtin agent '{builtin_name}'")
        return graph
    except Exception as e:
        logger.error(f"Failed to build builtin agent '{builtin_name}': {e}")
        return None
