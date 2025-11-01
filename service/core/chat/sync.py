"""
Synchronous chat response logic for AI conversations.
"""

import logging
from typing import List

from sqlmodel.ext.asyncio.session import AsyncSession

from core.providers import ChatCompletionRequest, ChatMessage, get_user_provider_manager
from models.agent import Agent
from models.topic import Topic as TopicModel

from .messages import build_system_prompt
from .tools import execute_tool_call, format_tool_result, prepare_mcp_tools

logger = logging.getLogger(__name__)


async def get_ai_response(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
) -> str:
    """
    Gets a response from the AI model based on the message and chat history.
    Routes to appropriate execution engine (regular vs graph agents).
    """
    try:
        # Import here to avoid circular imports
        from core.chat.execution_router import ChatExecutionRouter
        from repo.session import SessionRepository

        # Get agent_id from session
        session_repo = SessionRepository(db)
        session = await session_repo.get_session_by_id(topic.session_id)
        agent_id = session.agent_id if session else None

        # Route execution based on agent type
        router = ChatExecutionRouter(db)
        return await router.route_execution(message_text, topic, user_id, agent_id)

    except Exception as e:
        logger.error(f"Failed to get AI response: {e}")
        return f"I'm sorry, but I encountered an error while processing your request: {e}"


async def get_ai_response_legacy(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    agent: Agent | None = None,
) -> str:
    """
    Gets a response from the AI model based on the message and chat history.
    """
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        return "Sorry, no LLM providers configured. Please configure a provider first."

    # Use the provided agent parameter (for legacy compatibility)
    # If no agent provided, try to load from session
    if agent is None:
        from repo.agent import AgentRepository
        from repo.session import SessionRepository

        session_repo = SessionRepository(db)
        session = await session_repo.get_session_by_id(topic.session_id)

        if session and session.agent_id:
            agent_repo = AgentRepository(db)
            agent = await agent_repo.get_agent_by_id(session.agent_id)

    provider = None
    if agent and agent.provider_id:
        provider = user_provider_manager.get_provider(str(agent.provider_id))
        if provider:
            logger.info(f"Using agent-specific provider: {agent.provider_id}")
        else:
            logger.warning(
                f"Agent {agent.id} has provider_id {agent.provider_id} "
                f"but it's not available for user {user_id}. Falling back to default."
            )
    if not provider:
        provider = user_provider_manager.get_active_provider()
        logger.info(f"Using user's default provider for user {user_id}")
    if not provider:
        logger.error(f"No LLM provider available for user {user_id}")
        return "Sorry, no AI provider is currently available."

    system_prompt = await build_system_prompt(db, agent)

    # Load conversation history using MessageRepository
    from repo.message import MessageRepository

    message_repo = MessageRepository(db)
    history_messages = await message_repo.get_messages_by_topic(topic.id, order_by_created=True)

    messages: List[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]
    for msg in history_messages:
        messages.append(ChatMessage(role=msg.role, content=msg.content))
    messages.append(ChatMessage(role="user", content=message_text))

    logger.info(f"Sending {len(messages)} messages to AI provider {provider.provider_name} for topic {topic.id}")

    try:
        model = provider.model
        logger.info(f"Using model: {model} with temperature: {provider.temperature}")
        tools = await prepare_mcp_tools(db, agent)
        request = ChatCompletionRequest(
            messages=messages,
            model=model,
            temperature=provider.temperature,
            max_tokens=provider.max_tokens,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None,
        )
        response = await provider.chat_completion(request)
        logger.info(f"Response from provider: {response}")
        if response.tool_calls and len(response.tool_calls) > 0:
            logger.info(f"AI requested {len(response.tool_calls)} tool call(s)")
            assistant_content = response.content or "I'll use the available tools to help you."
            messages.append(ChatMessage(role="assistant", content=assistant_content))
            tool_results = []
            for tool_call in response.tool_calls:
                # Ensure identifiers are extracted before executing so they are available in the except block
                tool_name = tool_call.get("function", {}).get("name", "") if isinstance(tool_call, dict) else ""
                tool_args = (
                    tool_call.get("function", {}).get("arguments", "{}") if isinstance(tool_call, dict) else "{}"
                )
                tool_id = tool_call.get("id", "") if isinstance(tool_call, dict) else ""
                try:
                    logger.info(f"Executing tool: {tool_name} with args: {tool_args}")
                    tool_result = await execute_tool_call(db, tool_name, tool_args, agent)
                    formatted_result = format_tool_result(tool_result, tool_name)
                    tool_results.append({"tool_call_id": tool_id, "content": formatted_result})
                    messages.append(ChatMessage(role="tool", content=formatted_result))
                    logger.info(f"Added tool result to conversation: {formatted_result[:200]}...")
                except Exception as tool_error:
                    logger.error(f"Tool execution failed: {tool_error}")
                    error_msg = f"Error executing tool '{tool_name}': {str(tool_error)[:200]}"
                    messages.append(ChatMessage(role="tool", content=error_msg))
            try:
                logger.info(f"Preparing final request with {len(messages)} messages")
                total_chars = sum(len(msg.content) for msg in messages)
                logger.info(f"Approximate conversation length: {total_chars} characters")
                final_request = ChatCompletionRequest(
                    messages=messages,
                    model=model,
                    temperature=provider.temperature,
                    max_tokens=provider.max_tokens,
                    tools=None,
                    tool_choice=None,
                )
                final_response = await provider.chat_completion(final_request)
                logger.info(
                    f"Final response from provider: content='{final_response.content}', "
                    f"tool_calls={final_response.tool_calls}"
                )
                if final_response.content:
                    logger.info(f"Received final AI response after tool execution")
                    return final_response.content
                else:
                    logger.warning(f"Final response had no content: {final_response}")
                    return "I executed the requested tools but couldn't generate a final response."
            except Exception as final_error:
                logger.error(f"Failed to get final response after tool execution: {final_error}")
                return f"I executed the tools but encountered an error generating the final response: {final_error}"
        if response.content:
            logger.info(f"Received AI response from {provider.provider_name} for topic {topic.id}")
            return response.content
        else:
            return "Sorry, I could not generate a response."
    except Exception as e:
        logger.error(f"Failed to call AI provider {provider.provider_name} for topic {topic.id}: {e}")
        return f"Sorry, the AI service is currently unavailable. Error: {e}"
