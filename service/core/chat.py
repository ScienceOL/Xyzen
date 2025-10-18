"""
Chat service core module.
This module provides the core functionality for handling chat operations,
including message processing, user management, and chat history management.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from core.mcp import _async_check_mcp_server_status
from core.providers import (
    ChatCompletionRequest,
    ChatMessage,
    get_user_provider_manager,
    provider_manager,
)
from middleware.database.connection import AsyncSessionLocal
from models import McpServer
from models.topic import Topic as TopicModel
from repository import ProviderRepository

# --- Logger Setup ---
logger = logging.getLogger(__name__)


async def _load_providers_from_database() -> None:
    """
    Load LLM providers from the database providers table using the async repository.
    """
    try:
        async with AsyncSessionLocal() as db:
            provider_repo = ProviderRepository(db)
            providers = await provider_repo.get_all_providers()

            for db_provider in providers:
                try:
                    # Use provider_type from database instead of guessing from name
                    provider_type = db_provider.provider_type

                    # Build provider kwargs
                    provider_kwargs = {
                        "default_model": db_provider.model or "gpt-4o",
                        "max_tokens": db_provider.max_tokens,
                        "temperature": db_provider.temperature,
                        "timeout": db_provider.timeout,
                    }

                    # Add Azure-specific configuration if needed
                    if provider_type == "azure_openai":
                        provider_kwargs["azure_endpoint"] = db_provider.api
                        # You can add api_version if it's stored in the database

                    provider_manager.add_provider(
                        name=f"db_{db_provider.provider_type}_{db_provider.id}",
                        provider_type=provider_type,
                        api_key=db_provider.key,
                        base_url=db_provider.api,
                        **provider_kwargs,
                    )
                    logger.info(
                        f"Loaded provider from database: {db_provider.name} "
                        f"(type: {db_provider.provider_type}, default: {db_provider.is_default})"
                    )

                except Exception as e:
                    logger.error(f"Failed to load provider {db_provider.name} from database: {e}")

    except Exception as e:
        logger.error(f"Failed to load providers from database: {e}")


async def get_ai_response_stream(
    db: AsyncSession,
    message_text: str,
    topic: TopicModel,
    user_id: str,
    connection_manager: Optional[Any] = None,
    connection_id: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Gets a streaming response from the AI model based on the message and chat history.

    Args:
        db: The database session.
        message_text: The user's message.
        topic: The current chat topic containing the history.
        user_id: The user ID to load providers for.
        connection_manager: Optional connection manager for WebSocket.
        connection_id: Optional connection ID for WebSocket.

    Yields:
        Dict containing stream events with type and data.
    """
    # Get user's provider manager and select appropriate provider
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        yield {"type": "error", "data": {"error": "No LLM providers configured. Please configure a provider first."}}
        return

    # Check if agent has a specific provider configured
    provider = None
    if topic.session.agent and topic.session.agent.provider_id:
        provider = user_provider_manager.get_provider(str(topic.session.agent.provider_id))
        if provider:
            logger.info(f"Using agent-specific provider: {topic.session.agent.provider_id}")
        else:
            logger.warning(
                f"Agent {topic.session.agent.id} has provider_id {topic.session.agent.provider_id} "
                f"but it's not available for user {user_id}. Falling back to default."
            )

    # Fallback to user's default provider
    if not provider:
        provider = user_provider_manager.get_active_provider()
        logger.info(f"Using user's default provider for user {user_id}")

    if not provider:
        logger.error(f"No LLM provider available for user {user_id}")
        yield {"type": "error", "data": {"error": "No AI provider is currently available."}}
        return

    # Prepare system prompt
    system_prompt = "You are a helpful AI assistant."
    if topic.session.agent and topic.session.agent.prompt:
        system_prompt = topic.session.agent.prompt

    # Build messages list
    messages: List[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]

    # Add history messages from the topic
    for msg in topic.messages:
        messages.append(ChatMessage(role=msg.role, content=msg.content))

    # Add the current user message
    messages.append(ChatMessage(role="user", content=message_text))

    logger.info(f"Sending {len(messages)} messages to AI provider {provider.provider_name} for topic {topic.id}")

    try:
        # Use model from the selected provider
        model = provider.default_model
        logger.info(f"Using model: {model} with temperature: {provider.temperature}")

        # Prepare tools if MCP servers are available
        tools = await _prepare_mcp_tools(db, topic)

        # Create request
        request = ChatCompletionRequest(
            messages=messages,
            model=model,
            temperature=provider.temperature,
            max_tokens=provider.max_tokens,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None,
        )

        # Smart approach: Check for tool calls first to avoid empty streaming responses
        # This prevents the issue of starting a stream that has no content when tools are needed

        logger.info("Determining response type (streaming vs tool calls)")

        # Make an initial request to check if tool calls are needed
        initial_response = await provider.chat_completion(request)

        # If tool calls are needed, handle them in the tool call flow (non-streaming)
        if initial_response.tool_calls and len(initial_response.tool_calls) > 0:
            logger.info(f"AI requested {len(initial_response.tool_calls)} tool call(s)")
            logger.info("Proceeding with tool call flow")
            response = initial_response
            message_id = f"tool_msg_{int(asyncio.get_event_loop().time() * 1000)}"

        # If no tool calls needed and we have content, provide streaming experience
        elif initial_response.content and provider.supports_streaming():
            logger.info("No tool calls needed - providing streaming response for better UX")
            message_id = f"stream_{int(asyncio.get_event_loop().time() * 1000)}"
            yield {"type": "streaming_start", "data": {"id": message_id}}

            # Stream the response for better user experience
            content_chunks = []
            try:
                async for chunk in provider.chat_completion_stream(request):
                    if chunk.content:
                        content_chunks.append(chunk.content)
                        yield {"type": "streaming_chunk", "data": {"id": message_id, "content": chunk.content}}

                full_content = "".join(content_chunks)
                yield {
                    "type": "streaming_end",
                    "data": {
                        "id": message_id,
                        "content": full_content,
                        "created_at": asyncio.get_event_loop().time(),
                    },
                }
                return

            except Exception as e:
                logger.warning(f"Streaming failed, using initial response: {e}")
                yield {
                    "type": "streaming_end",
                    "data": {
                        "id": message_id,
                        "content": initial_response.content,
                        "created_at": asyncio.get_event_loop().time(),
                    },
                }
                return

        # Fallback: Use initial response directly (non-streaming)
        else:
            logger.info("Using direct response (no streaming)")
            if initial_response.content:
                message_id = f"msg_{int(asyncio.get_event_loop().time() * 1000)}"
                yield {
                    "type": "message",
                    "data": {
                        "id": message_id,
                        "role": "assistant",
                        "content": initial_response.content,
                        "created_at": asyncio.get_event_loop().time(),
                    },
                }
            return

        # Tool call handling (response is set from initial_response above)
        if response.tool_calls and len(response.tool_calls) > 0:
            logger.info(f"AI requested {len(response.tool_calls)} tool call(s)")

            # Log tool call details
            for i, tool_call in enumerate(response.tool_calls):
                tool_name = tool_call.get("function", {}).get("name", "unknown")
                logger.info(f"Tool call {i+1}: {tool_name}")

            # Check if tool confirmation is required
            require_confirmation = (
                topic.session.agent
                and hasattr(topic.session.agent, "require_tool_confirmation")
                and topic.session.agent.require_tool_confirmation
            )

            logger.info(f"Tool confirmation required: {require_confirmation}")

            if require_confirmation and connection_manager and connection_id:
                logger.info("Sending tool calls for user confirmation")
                # Store the complete context for each tool call that needs confirmation
                for tool_call in response.tool_calls:
                    tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")

                    # Store complete execution context in the connection manager
                    connection_manager.pending_tool_calls[tool_call_id] = {
                        "connection_id": connection_id,
                        "tool_calls": response.tool_calls,
                        "topic": topic,
                        "messages": messages,
                        "provider": provider,
                        "message_id": message_id,
                        "model": model,
                    }

                    tool_call_event = {
                        "type": "tool_call_request",
                        "data": {
                            "id": tool_call_id,
                            "name": tool_call.get("function", {}).get("name", ""),
                            "description": f"Tool: {tool_call.get('function', {}).get('name', '')}",
                            "arguments": json.loads(tool_call.get("function", {}).get("arguments", "{}")),
                            "status": "waiting_confirmation",
                            "timestamp": asyncio.get_event_loop().time(),
                        },
                    }
                    logger.info(f"Sending tool call event: {tool_call_event}")
                    yield tool_call_event
                return  # Exit here, tool execution will continue after confirmation
            else:
                logger.info("Sending tool calls and executing immediately without confirmation")
                # Send tool calls for display and execute immediately
                for tool_call in response.tool_calls:
                    # First send the tool call request event for UI display
                    tool_call_event = {
                        "type": "tool_call_request",
                        "data": {
                            "id": tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}"),
                            "name": tool_call.get("function", {}).get("name", ""),
                            "description": f"Tool: {tool_call.get('function', {}).get('name', '')}",
                            "arguments": json.loads(tool_call.get("function", {}).get("arguments", "{}")),
                            "status": "executing",
                            "timestamp": asyncio.get_event_loop().time(),
                        },
                    }
                    logger.info(f"Sending tool call event (immediate execution): {tool_call_event}")
                    yield tool_call_event

                # Execute tools immediately without confirmation
                try:
                    tool_results = await _execute_tool_calls(db, response.tool_calls, topic)

                    # Send tool completion events
                    for tool_call in response.tool_calls:
                        tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
                        result = tool_results.get(tool_call_id)
                        if result:
                            completion_event = {
                                "type": "tool_call_response",
                                "data": {
                                    "toolCallId": tool_call_id,
                                    "status": "completed",
                                    "result": result,
                                },
                            }
                            logger.info(f"Sending tool completion event: {completion_event}")
                            yield completion_event

                    # Add tool call message to conversation
                    assistant_tool_message = ChatMessage(
                        role="assistant", content=f"I need to use tools to help answer your question."
                    )

                    # Add tool results to messages
                    tool_result_messages = []
                    for tool_call_id, result in tool_results.items():
                        # Extract clean result for AI consumption
                        if isinstance(result, dict):
                            if "content" in result:
                                # Try to extract the actual result value
                                content = result["content"]
                                if isinstance(content, str) and content.startswith("[TextContent"):
                                    # Parse the TextContent result to get the actual value
                                    try:
                                        import re

                                        match = re.search(r"text='([^']*)'", content)
                                        if match:
                                            result_content = match.group(1)
                                        else:
                                            result_content = str(result)
                                    except Exception:
                                        result_content = str(result)
                                else:
                                    result_content = str(content)
                            else:
                                result_content = str(result)
                        else:
                            result_content = str(result)

                        logger.info(f"Processed tool result for AI: {result_content}")
                        tool_result_messages.append(
                            ChatMessage(role="user", content=f"Tool execution result: {result_content}")
                        )

                    # Get final response from AI with tool results using streaming for better UX
                    final_messages = messages + [assistant_tool_message] + tool_result_messages
                    final_request = ChatCompletionRequest(
                        messages=final_messages,
                        model=model,
                        temperature=provider.temperature,
                        max_tokens=provider.max_tokens,
                    )

                    # Use streaming for the final response if supported
                    if provider.supports_streaming():
                        logger.info("Using streaming for final AI response after tool execution")
                        final_message_id = f"final_stream_{int(asyncio.get_event_loop().time() * 1000)}"
                        yield {"type": "streaming_start", "data": {"id": final_message_id}}

                        final_content_chunks = []
                        async for chunk in provider.chat_completion_stream(final_request):
                            if chunk.content:
                                final_content_chunks.append(chunk.content)
                                yield {
                                    "type": "streaming_chunk",
                                    "data": {"id": final_message_id, "content": chunk.content},
                                }

                        final_full_content = "".join(final_content_chunks)
                        if final_full_content.strip():
                            yield {
                                "type": "streaming_end",
                                "data": {
                                    "id": final_message_id,
                                    "content": final_full_content,
                                    "created_at": asyncio.get_event_loop().time(),
                                },
                            }
                        else:
                            logger.warning("Final AI streaming response after tool execution was empty")
                    else:
                        # Fall back to non-streaming if not supported
                        final_response = await provider.chat_completion(final_request)
                        if final_response.content:
                            yield {
                                "type": "message",
                                "data": {
                                    "id": message_id,
                                    "role": "assistant",
                                    "content": final_response.content,
                                    "created_at": asyncio.get_event_loop().time(),
                                },
                            }
                        else:
                            logger.warning("Final AI response after tool execution was empty")
                    return

                except Exception as e:
                    logger.error(f"Error executing tools immediately: {e}")
                    # Send error events for all tool calls
                    for tool_call in response.tool_calls:
                        tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
                        error_event = {
                            "type": "tool_call_response",
                            "data": {
                                "toolCallId": tool_call_id,
                                "status": "failed",
                                "error": str(e),
                            },
                        }
                        yield error_event
                    return

        # Handle regular content response (no tool calls)
        if response.content:
            yield {
                "type": "message",
                "data": {
                    "id": message_id,
                    "role": "assistant",
                    "content": response.content,
                    "created_at": asyncio.get_event_loop().time(),
                },
            }
        else:
            yield {"type": "error", "data": {"error": "Sorry, I could not generate a response."}}

    except Exception as e:
        logger.error(f"Failed to call AI provider {provider.provider_name} for topic {topic.id}: {e}")
        yield {"type": "error", "data": {"error": f"Sorry, the AI service is currently unavailable. Error: {e}"}}


async def get_ai_response(db: AsyncSession, message_text: str, topic: TopicModel, user_id: str) -> str:
    """
    Gets a response from the AI model based on the message and chat history.

    Args:
        db: The database session.
        message_text: The user's message.
        topic: The current chat topic containing the history.
        user_id: The user ID to load providers for.

    Returns:
        The AI's response as a string.
    """
    # Get user's provider manager and select appropriate provider
    try:
        user_provider_manager = await get_user_provider_manager(user_id, db)
    except ValueError as e:
        logger.error(f"Failed to get provider manager for user {user_id}: {e}")
        return "Sorry, no LLM providers configured. Please configure a provider first."

    # Check if agent has a specific provider configured
    provider = None
    if topic.session.agent and topic.session.agent.provider_id:
        provider = user_provider_manager.get_provider(str(topic.session.agent.provider_id))
        if provider:
            logger.info(f"Using agent-specific provider: {topic.session.agent.provider_id}")
        else:
            logger.warning(
                f"Agent {topic.session.agent.id} has provider_id {topic.session.agent.provider_id} "
                f"but it's not available for user {user_id}. Falling back to default."
            )

    # Fallback to user's default provider
    if not provider:
        provider = user_provider_manager.get_active_provider()
        logger.info(f"Using user's default provider for user {user_id}")

    if not provider:
        logger.error(f"No LLM provider available for user {user_id}")
        return "Sorry, no AI provider is currently available."

    # Prepare system prompt
    system_prompt = "You are a helpful AI assistant."
    if topic.session.agent and topic.session.agent.prompt:
        system_prompt = topic.session.agent.prompt

    # Build messages list
    messages: List[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]

    # Add history messages from the topic
    for msg in topic.messages:
        messages.append(ChatMessage(role=msg.role, content=msg.content))

    # Add the current user message
    messages.append(ChatMessage(role="user", content=message_text))

    logger.info(f"Sending {len(messages)} messages to AI provider {provider.provider_name} for topic {topic.id}")

    try:
        # Use model from the selected provider
        model = provider.default_model
        logger.info(f"Using model: {model} with temperature: {provider.temperature}")

        # Prepare tools if MCP servers are available
        tools = await _prepare_mcp_tools(db, topic)

        # Create request
        request = ChatCompletionRequest(
            messages=messages,
            model=model,
            temperature=provider.temperature,
            max_tokens=provider.max_tokens,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None,
        )

        # Get response from provider
        response = await provider.chat_completion(request)

        logger.info(f"Response from provider: {response}")

        # Handle tool calls if present
        if response.tool_calls and len(response.tool_calls) > 0:
            logger.info(f"AI requested {len(response.tool_calls)} tool call(s)")

            # Add the assistant's message to history (even if no content, the tool calls are important)
            assistant_content = response.content or "I'll use the available tools to help you."
            messages.append(ChatMessage(role="assistant", content=assistant_content))

            # Execute each tool call and collect results
            tool_results = []
            for tool_call in response.tool_calls:
                try:
                    tool_name = tool_call.get("function", {}).get("name", "")
                    tool_args = tool_call.get("function", {}).get("arguments", "{}")
                    tool_id = tool_call.get("id", "")

                    logger.info(f"Executing tool: {tool_name} with args: {tool_args}")

                    # Execute the tool (this would need to be implemented)
                    tool_result = await _execute_tool_call(db, tool_name, tool_args, topic)

                    # Process and format tool result
                    formatted_result = _format_tool_result(tool_result, tool_name)

                    # Add tool result to messages
                    tool_results.append({"tool_call_id": tool_id, "content": formatted_result})
                    messages.append(ChatMessage(role="tool", content=formatted_result))

                    logger.info(f"Added tool result to conversation: {formatted_result[:200]}...")

                except Exception as tool_error:
                    logger.error(f"Tool execution failed: {tool_error}")
                    error_msg = f"Error executing tool '{tool_name}': {str(tool_error)[:200]}"
                    messages.append(ChatMessage(role="tool", content=error_msg))

            # Make another request to get the final response
            try:
                # Log the message count for debugging
                logger.info(f"Preparing final request with {len(messages)} messages")

                # Calculate approximate token count (rough estimate)
                total_chars = sum(len(msg.content) for msg in messages)
                logger.info(f"Approximate conversation length: {total_chars} characters")

                # Don't include tools in the final request to prevent additional tool calls
                final_request = ChatCompletionRequest(
                    messages=messages,
                    model=model,
                    temperature=provider.temperature,
                    max_tokens=provider.max_tokens,
                    tools=None,  # No tools for final response
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

        # Handle regular content response
        if response.content:
            logger.info(f"Received AI response from {provider.provider_name} for topic {topic.id}")
            return response.content
        else:
            return "Sorry, I could not generate a response."

    except Exception as e:
        logger.error(f"Failed to call AI provider {provider.provider_name} for topic {topic.id}: {e}")
        return f"Sorry, the AI service is currently unavailable. Error: {e}"


async def _prepare_mcp_tools(db: AsyncSession, topic: TopicModel) -> List[Dict[str, Any]]:
    """
    Prepare MCP tools for the AI request.

    Args:
        db: The database session.
        topic: The current chat topic

    Returns:
        List of tool definitions
    """
    tools: List[Dict[str, Any]] = []

    if topic.session.agent and topic.session.agent.mcp_servers:
        # Update all MCP server tool lists before generating response
        logger.info("Updating MCP server tools before generating response...")
        update_tasks = []

        for server in topic.session.agent.mcp_servers:
            update_tasks.append(_async_check_mcp_server_status(server.id))

        # Execute all server status checks concurrently
        await asyncio.gather(*update_tasks, return_exceptions=True)
        logger.info("MCP server tools updated")

        # Refresh server data from database to build tool list
        refreshed_servers = []
        for server in topic.session.agent.mcp_servers:
            refreshed_server = await db.get(type(server), server.id)
            if refreshed_server:
                refreshed_servers.append(refreshed_server)

        # Build tool list
        for server in refreshed_servers:
            if server.tools and server.status == "online":
                for tool in server.tools:
                    # Convert MCP tool format to standard format
                    standard_tool = {
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "parameters": tool.get("inputSchema", {}),
                    }
                    tools.append(standard_tool)

        if tools:
            logger.info(f"Using {len(tools)} tools from {len(refreshed_servers)} servers")

    return tools


async def _execute_tool_call(db: AsyncSession, tool_name: str, tool_args: str, topic: TopicModel) -> str:
    """
    Execute a tool call by finding the appropriate MCP server and calling the tool.

    Args:
        db: The database session.
        tool_name: The name of the tool to execute
        tool_args: JSON string containing the tool arguments
        topic: The current chat topic

    Returns:
        The result of the tool execution as a string
    """
    try:
        import json

        try:
            args_dict = json.loads(tool_args) if tool_args else {}
        except json.JSONDecodeError:
            return f"Error: Invalid JSON arguments for tool '{tool_name}'"

        logger.info(f"Executing tool '{tool_name}' with arguments: {args_dict}")

        # Find the MCP server that provides this tool
        if topic.session.agent and topic.session.agent.mcp_servers:
            for server in topic.session.agent.mcp_servers:
                refreshed_server = await db.get(type(server), server.id)
                if refreshed_server and refreshed_server.tools and refreshed_server.status == "online":
                    for tool in refreshed_server.tools:
                        if tool.get("name") == tool_name:
                            # Found the tool, now execute it via MCP
                            try:
                                result = await _call_mcp_tool(refreshed_server, tool_name, args_dict)
                                return str(result)
                            except Exception as exec_error:
                                logger.error(f"MCP tool execution failed: {exec_error}")
                                return f"Error executing tool '{tool_name}': {exec_error}"

        return f"Tool '{tool_name}' not found or server not available"

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return f"Error: {e}"


async def _call_mcp_tool(server: McpServer, tool_name: str, args_dict: Dict[str, Any]) -> Any:
    """
    Call a specific tool on an MCP server.

    Args:
        server: The MCP server object
        tool_name: The name of the tool to call
        args_dict: The arguments to pass to the tool

    Returns:
        The result from the tool execution
    """
    try:
        from fastmcp import Client
        from fastmcp.client.auth import BearerAuth

        logger.info(f"Calling MCP tool '{tool_name}' on server {server.url}")

        # Use BearerAuth if a token is provided, otherwise no auth
        auth = BearerAuth(server.token) if server.token else None

        # Initialize the client with the server URL and auth helper
        client = Client(server.url, auth=auth)

        async with client:
            # Call the tool
            result = await client.call_tool(tool_name, args_dict)
            logger.info(f"MCP tool '{tool_name}' returned: {result}")
            return result.content if hasattr(result, "content") else str(result)

    except ImportError:
        # Fallback: try to mock the tool execution for testing
        logger.warning(f"MCP integration not available, mocking tool '{tool_name}' result")
        return f"Mock result for tool '{tool_name}' with args {args_dict}"
    except Exception as e:
        logger.error(f"MCP tool call failed: {e}")
        raise e


def _format_tool_result(tool_result: Any, tool_name: str) -> str:
    """
    Format tool result for AI consumption, handling large JSON responses.

    Args:
        tool_result: The raw tool result
        tool_name: The name of the tool that was executed

    Returns:
        Formatted string suitable for AI processing
    """
    try:
        # If result has content attribute, extract it
        if hasattr(tool_result, "content") and tool_result.content:
            content = tool_result.content

            # If content is a list, get the first text content
            if isinstance(content, list) and len(content) > 0:
                first_content = content[0]
                if hasattr(first_content, "text"):
                    result_text = first_content.text
                else:
                    result_text = str(first_content)
            else:
                result_text = str(content)
        else:
            result_text = str(tool_result)

        # Try to parse as JSON for special formatting
        try:
            data = json.loads(result_text)

            # Special handling for tool_environment_current_functions
            if tool_name == "tool_environment_current_functions" and isinstance(data, dict):
                if "summary" in data:
                    summary = data["summary"]
                    formatted = f"Tool Environment Status:\n"
                    formatted += f"• Total Functions: {summary.get('total_functions', 'N/A')}\n"
                    formatted += f"• Built-in Tools: {summary.get('builtin_tools', 'N/A')}\n"
                    formatted += f"• Dynamic Tools: {summary.get('dynamic_tools', 'N/A')}\n"
                    formatted += f"• Proxy Tools: {summary.get('proxy_tools', 'N/A')}\n"
                    formatted += f"• Tool Environments: {summary.get('tool_environments', 'N/A')}\n"

                    if "builtin_tools" in data and isinstance(data["builtin_tools"], dict):
                        formatted += f"\nAvailable Built-in Tools:\n"
                        for tool, info in list(data["builtin_tools"].items())[:5]:  # Limit to first 5
                            formatted += f"• {tool}: {info.get('description', 'No description')[:100]}...\n"

                        if len(data["builtin_tools"]) > 5:
                            formatted += f"... and {len(data['builtin_tools']) - 5} more tools\n"

                    return formatted

            # For other JSON responses, provide a summary
            if isinstance(data, dict):
                keys = list(data.keys())[:5]  # First 5 keys
                return f"Tool '{tool_name}' returned JSON data with keys: {keys}"
            elif isinstance(data, list):
                return f"Tool '{tool_name}' returned a list with {len(data)} items"

        except json.JSONDecodeError:
            pass

        # Truncate very long results
        if len(result_text) > 2000:
            truncated_result = f"Tool '{tool_name}' result (truncated): {result_text[:1500]}..."
            length_info = f"\n(Result was {len(result_text)} characters long)"
            return truncated_result + length_info

        return f"Tool '{tool_name}' result: {result_text}"

    except Exception as e:
        logger.error(f"Error formatting tool result: {e}")
        return f"Tool '{tool_name}' executed but result formatting failed: {e}"


async def _execute_tool_calls(db: AsyncSession, tool_calls: List[Dict[str, Any]], topic: TopicModel) -> Dict[str, Any]:
    """
    Execute multiple tool calls and return their results.

    Args:
        db: The database session.
        tool_calls: List of tool call dictionaries from AI response
        topic: The current chat topic

    Returns:
        Dictionary mapping tool call IDs to their results
    """
    results = {}

    for tool_call in tool_calls:
        tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
        function_info = tool_call.get("function", {})
        tool_name = function_info.get("name", "")
        tool_args = function_info.get("arguments", "{}")

        logger.info(f"Executing tool call {tool_call_id}: {tool_name}")

        try:
            result = await _execute_tool_call(db, tool_name, tool_args, topic)
            results[tool_call_id] = {"content": result}
        except Exception as e:
            logger.error(f"Failed to execute tool call {tool_call_id}: {e}")
            results[tool_call_id] = {"error": str(e)}

    return results
