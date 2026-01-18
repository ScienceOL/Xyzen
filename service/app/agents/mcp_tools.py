"""
Tool-related logic for chat service: preparation, execution, formatting.
"""

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.mcp import async_check_mcp_server_status
from app.models.agent import Agent
from app.models.mcp import McpServer
from app.repos.mcp import McpRepository

logger = logging.getLogger(__name__)


async def prepare_mcp_tools(
    db: AsyncSession, agent: Agent | None, session_id: UUID | None = None
) -> list[dict[str, Any]]:
    """
    Prepare MCP tools from both agent-level and session-level MCP servers.

    Args:
        db: Database session
        agent: Agent instance (optional)
        session_id: Session UUID (optional)

    Returns:
        List of Tool definitions
    """
    tools: list[dict[str, Any]] = []
    all_mcp_servers = []

    # 1. Load agent-level MCP servers
    if agent:
        from app.repos.agent import AgentRepository

        agent_repo = AgentRepository(db)
        agent_mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)
        if agent_mcp_servers:
            all_mcp_servers.extend(agent_mcp_servers)
            logger.info(f"Loaded {len(agent_mcp_servers)} agent-level MCP servers")

    # 2. Load session-level MCP servers (e.g., search engines)
    if session_id:
        from uuid import UUID

        from app.repos.session import SessionRepository

        # Convert session_id to UUID if it's a string
        if isinstance(session_id, str):
            session_id = UUID(session_id)

        session_repo = SessionRepository(db)
        session_mcp_servers = await session_repo.get_session_mcp_servers(session_id)
        if session_mcp_servers:
            all_mcp_servers.extend(session_mcp_servers)
            logger.info(f"Loaded {len(session_mcp_servers)} session-level MCP servers")

    # 3. Update status and extract tools from all MCP servers
    if all_mcp_servers:
        logger.info(f"Updating {len(all_mcp_servers)} MCP server tools before generating response...")
        mcp_repo = McpRepository(db)

        # Update server status for all servers
        update_tasks = []
        for server in all_mcp_servers:
            update_tasks.append(async_check_mcp_server_status(server.id))
        await asyncio.gather(*update_tasks, return_exceptions=True)
        logger.info("MCP server tools updated")

        # Get refreshed servers using repository
        refreshed_servers = []
        for server in all_mcp_servers:
            refreshed_server = await mcp_repo.get_mcp_server_by_id(server.id)
            if refreshed_server:
                refreshed_servers.append(refreshed_server)

        # Extract tools from online servers
        for server in refreshed_servers:
            if server.tools and server.status == "online":
                for tool in server.tools:
                    schema = tool.get("inputSchema", {})

                    standard_tool = {
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "parameters": schema,
                    }
                    tools.append(standard_tool)
        if tools:
            logger.info(f"Using {len(tools)} tools from {len(refreshed_servers)} MCP servers")

    return tools


async def execute_tool_call(
    db: AsyncSession, tool_name: str, tool_args: str, agent: Any, session_id: Any = None
) -> Any:
    """
    Execute a tool call by searching in both agent-level and session-level MCP servers.

    Args:
        db: Database session
        tool_name: Name of the tool to execute
        tool_args: JSON string of tool arguments
        agent: Agent instance (optional)
        session_id: Session UUID (optional)

    Returns:
        Tool execution result (Any type, preserving structure)
    """
    try:
        try:
            args_dict = json.loads(tool_args) if tool_args else {}
        except json.JSONDecodeError:
            return f"Error: Invalid JSON arguments for tool '{tool_name}'"
        logger.info(f"Executing tool '{tool_name}' with arguments: {args_dict}")

        all_mcp_servers: list[McpServer] = []

        # 1. Load agent-level MCP servers
        if agent:
            from app.repos.agent import AgentRepository

            agent_repo = AgentRepository(db)
            agent_mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)
            if agent_mcp_servers:
                all_mcp_servers.extend(agent_mcp_servers)

        # 2. Load session-level MCP servers
        if session_id:
            from uuid import UUID

            from app.repos.session import SessionRepository

            # Convert session_id to UUID if it's a string
            if isinstance(session_id, str):
                session_id = UUID(session_id)

            session_repo = SessionRepository(db)
            session_mcp_servers = await session_repo.get_session_mcp_servers(session_id)
            if session_mcp_servers:
                all_mcp_servers.extend(session_mcp_servers)

        # 3. Search for the tool in all MCP servers
        if all_mcp_servers:
            mcp_repo = McpRepository(db)

            for server in all_mcp_servers:
                refreshed_server = await mcp_repo.get_mcp_server_by_id(server.id)
                if refreshed_server and refreshed_server.tools and refreshed_server.status == "online":
                    for tool in refreshed_server.tools:
                        if tool.get("name") == tool_name:
                            # TODO: Add better logic for knowledge_set_id filtering
                            input_schema = tool.get("inputSchema", {})

                            # Debug logging
                            logger.info(
                                f"Checking tool '{tool_name}' for injection. Schema props: {list(input_schema.get('properties', {}).keys())}"
                            )

                            if "knowledge_set_id" in input_schema.get("properties", {}):
                                logger.info(f"Tool '{tool_name}' requires knowledge_set_id.")
                                if agent:
                                    ks_id = getattr(agent, "knowledge_set_id", None)
                                    logger.info(f"Agent found. Knowledge Set ID: {ks_id}")
                                    if ks_id:
                                        args_dict["knowledge_set_id"] = str(ks_id)
                                        logger.info(f"Injected knowledge_set_id: {ks_id} into args")
                                    else:
                                        logger.warning(f"Agent {agent.id} has NO knowledge_set_id bound!")
                                else:
                                    logger.warning("No agent context available for injection!")
                            else:
                                logger.info(f"Tool '{tool_name}' does NOT require knowledge_set_id.")

                            try:
                                result = await call_mcp_tool(refreshed_server, tool_name, args_dict)
                                # Return raw result (could be dict, list, str) to preserve structure
                                return result
                            except Exception as exec_error:
                                logger.error(f"MCP tool execution failed: {exec_error}")
                                return f"Error executing tool '{tool_name}': {exec_error}"
        return f"Tool '{tool_name}' not found or server not available"
    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return f"Error: {e}"


async def call_mcp_tool(server: McpServer, tool_name: str, args_dict: dict[str, Any]) -> Any:
    try:
        from fastmcp import Client
        from fastmcp.client.auth import BearerAuth

        logger.info(f"Calling MCP tool '{tool_name}' on server {server.url}")
        auth = BearerAuth(server.token) if server.token else None
        client = Client(server.url, auth=auth)
        async with client:
            result = await client.call_tool(tool_name, args_dict)
            logger.info(f"MCP tool '{tool_name}' returned: {result}")
            return result.content
    except ImportError:
        logger.warning(f"MCP integration not available, mocking tool '{tool_name}' result")
        return f"Mock result for tool '{tool_name}' with args {args_dict}"
    except Exception as e:
        logger.error(f"MCP tool call failed: {e}")
        raise e


def format_tool_result(tool_result: Any, tool_name: str) -> str:
    try:
        # If it's a FastMCP structure with 'content'
        if hasattr(tool_result, "content") and tool_result.content:
            content = tool_result.content
            # Handle list of content
            if isinstance(content, list):
                if not content:
                    return f"Tool '{tool_name}' returned empty content list"

                # Check for multimodal content (images)
                image_count = sum(1 for item in content if hasattr(item, "type") and item.type == "image")
                if image_count > 0:
                    text_parts = [item.text for item in content if hasattr(item, "type") and item.type == "text"]
                    text_summary = " ".join(text_parts)[:500] + "..." if text_parts else ""
                    return f"Tool '{tool_name}' returned {len(content)} items including {image_count} images. Text preview: {text_summary}"

                # Assume text
                first_content = content[0]
                if hasattr(first_content, "text"):
                    result_text = first_content.text
                else:
                    result_text = str(first_content)
            else:
                result_text = str(content)
        else:
            # Check for direct list (e.g. from our new handlers returning list[Image])
            if isinstance(tool_result, list):
                # Simple heuristic for list of images/objects
                if len(tool_result) > 0:
                    first_item = tool_result[0]
                    # Check for FastMCP objects
                    if hasattr(first_item, "format") or "image" in str(type(first_item)).lower():
                        return f"Tool '{tool_name}' returned {len(tool_result)} image/binary items."

                    # Unified handling for lists of dicts (text, images, mixed)
                    if isinstance(first_item, dict):
                        # fast-path: check if it looks like our standard content objects
                        if "type" in first_item or "image_url" in first_item or "text" in first_item:
                            text_content = []
                            image_count = 0
                            for item in tool_result:
                                if isinstance(item, dict):
                                    i_type = item.get("type")
                                    # Handle Text
                                    if i_type == "text" or "text" in item:
                                        # Avoid duplicating if type is text but content is empty
                                        text_val = item.get("text", "")
                                        if text_val:
                                            text_content.append(text_val)

                                    # Handle Images
                                    if i_type == "image_url" or "image_url" in item:
                                        image_count += 1

                            # Construct summary
                            result_str = "\n".join(text_content).strip()

                            if image_count > 0:
                                image_msg = f"[{image_count} Images]"
                                if result_str:
                                    result_str += f"\n\n{image_msg}"
                                else:
                                    result_str = image_msg

                            # If we successfully extracted something, return it
                            if result_str:
                                if len(result_str) > 2000:
                                    truncated_result = f"Tool '{tool_name}' result (truncated): {result_str[:1500]}..."
                                    length_info = f"\n(Result was {len(result_str)} characters long)"
                                    return truncated_result + length_info
                                return f"Tool '{tool_name}' result: {result_str}"

            result_text = str(tool_result)

        try:
            data = json.loads(result_text)
            if tool_name == "tool_environment_current_functions" and isinstance(data, dict):
                if "summary" in data:
                    summary = data["summary"]
                    formatted = "Tool Environment Status:\n"
                    formatted += f"• Total Functions: {summary.get('total_functions', 'N/A')}\n"
                    formatted += f"• Built-in Tools: {summary.get('builtin_tools', 'N/A')}\n"
                    formatted += f"• Dynamic Tools: {summary.get('dynamic_tools', 'N/A')}\n"
                    formatted += f"• Proxy Tools: {summary.get('proxy_tools', 'N/A')}\n"
                    formatted += f"• Tool Environments: {summary.get('tool_environments', 'N/A')}\n"
                    if "builtin_tools" in data and isinstance(data["builtin_tools"], dict):
                        formatted += "\nAvailable Built-in Tools:\n"
                        for tool, info in list(data["builtin_tools"].items())[:5]:
                            formatted += f"• {tool}: {info.get('description', 'No description')[:100]}...\n"
                        if len(data["builtin_tools"]) > 5:
                            formatted += f"... and {len(data['builtin_tools']) - 5} more tools\n"
                    return formatted
            if isinstance(data, dict):
                keys = list(data.keys())[:5]
                return f"Tool '{tool_name}' returned JSON data with keys: {keys}"
            elif isinstance(data, list):
                return f"Tool '{tool_name}' returned a list with {len(data)} items"
        except json.JSONDecodeError:
            pass

        # Truncate very long strings for display/logging
        if len(result_text) > 2000:
            truncated_result = f"Tool '{tool_name}' result (truncated): {result_text[:1500]}..."
            length_info = f"\n(Result was {len(result_text)} characters long)"
            return truncated_result + length_info
        return f"Tool '{tool_name}' result: {result_text}"
    except Exception as e:
        logger.error(f"Error formatting tool result: {e}")
        return f"Tool '{tool_name}' executed but result formatting failed: {e}"


async def execute_tool_calls(db: AsyncSession, tool_calls: list[dict[str, Any]], agent: Any) -> dict[str, Any]:
    results = {}
    for tool_call in tool_calls:
        tool_call_id = tool_call.get("id", f"tool_{int(asyncio.get_event_loop().time() * 1000)}")
        function_info = tool_call.get("function", {})
        tool_name = function_info.get("name", "")
        tool_args = function_info.get("arguments", "{}")
        logger.info(f"Executing tool call {tool_call_id}: {tool_name}")
        try:
            result = await execute_tool_call(db, tool_name, tool_args, agent)
            results[tool_call_id] = {"content": result}
        except Exception as e:
            logger.error(f"Failed to execute tool call {tool_call_id}: {e}")
            results[tool_call_id] = {"error": str(e)}
    return results
