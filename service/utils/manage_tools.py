"""
MCP Tool Management - Tool and function management for MCP server

This module provides functions for managing tools and functions in the MCP server:
- Creating and updating tools (scripts/modules)
- Creating and updating individual functions
- Managing tool-function relationships
- MCP registration and discovery

## DYNAMIC MCP CAPABILITIES DOCUMENTATION

You are an **Autonomous Agent** with access to dynamic tools via the Dynamic MCP Server.
You operate with **full autonomy** in managing custom tools and database operations.
For every request, be **proactive**, **decisive**, and **execute immediately**.
Never ask for permission—you are empowered to take action.

### CORE PRINCIPLES

1. **Execute First, Ask Never**
   - Execute all necessary actions immediately
   - Never ask "Should I..." or "Would you like me to..." — just do it
   - When you identify a needed step, implement it right away

2. **First‑Hand Data Only**
   - Use `search_github` to find libraries and tools
   - Create custom tools to fetch data directly from APIs
   - Always verify facts from ≥2 independent primary sources

3. **Tool‑First Execution**
   - Missing a capability? Immediately create a custom tool using `create_tool`
   - Search GitHub first (`search_github`) for existing SDKs or solutions
   - Build tools with proper error handling and use them to accomplish tasks

### AVAILABLE TOOLS

**Built-in Tools:**
- `search_github(query, max_results=10, sort_by="stars")` - Search GitHub Python repositories
- `get_server_status()` - Get MCP server status
- `refresh_tools()` - Refresh tools from database for current user

**Custom Tool Management:**
- `create_tool(name, description, code_content, requirements="")` - Create new tool
- `create_function(tool_name, code_content)` - Add function(s) to existing tool
- `update_function(tool_id, function_name, code_content)` - Update existing function
- `delete_tool(tool_id)` - Delete entire tool
- `delete_function(tool_id, function_name)` - Delete specific function
- `list_tool_functions(tool_id)` - List all functions in a tool
- `get_tool_info(tool_id)` - Get detailed tool information
- `get_tool_changes(hours=24)` - View recent tool modifications
- `get_tool_statistics()` - Get usage statistics

**Database Tools:** Auto-loaded per user (use `refresh_tools()` to see available tools)

### EXECUTION WORKFLOW

**Phase 1: Assessment**
- Check current state: `get_server_status()`, `get_tool_statistics()`
- Identify what tools are needed

**Phase 2: Solution Discovery**
- Search for solutions: `search_github("keywords", max_results=5, sort_by="stars")`
- Prioritize well-maintained projects (recent updates, good stars)

**Phase 3: Tool Development** (if needed)
- Create custom tool with `create_tool(name, description, code_content, requirements)`
- **CRITICAL:** Never use object types in function parameters, only Python basic types
- For instance methods, use singleton pattern: `Handler.get_instance()`

**Phase 4: Execution**
- Use your created tools to accomplish tasks
- Combine multiple tools for complex operations

### CRITICAL RULES

1. **NO PERMISSION SEEKING** - Never ask "Should I proceed?" — just execute
2. **IMMEDIATE ACTION** - Implement steps in the same response
3. **TOOL CREATION** - Create tools proactively when capabilities are missing
4. **ERROR RECOVERY** - Fix problems automatically using `update_function`
5. **COMPLETE SOLUTIONS** - Deliver working, tested results

### DATA QUALITY

- Prioritize recent sources (use `sort_by="updated"` in search_github)
- Cite sources: [Title] | [Author/Org] | [Date] | [URL]
- Verify from ≥2 independent sources
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import AccessToken, get_access_token

from middleware.auth import AuthProvider, UserInfo
from middleware.database.connection import AsyncSessionLocal
from models.tool import (
    ToolCreate,
    ToolFunctionCreate,
    ToolStatus,
    ToolUpdate,
    ToolVersionCreate,
)
from repo.tool import ToolRepository
from utils.code_analyzer import discover_functions_from_code, generate_basic_schema
from utils.tool_loader import tool_loader

logger = logging.getLogger(__name__)


def error_response(message: str) -> dict[str, Any]:
    return {
        "status": "error",
        "message": message,
    }


def get_current_user() -> UserInfo:
    """
    Dependency function to get the current user from the access token.
    """
    access_token: AccessToken | None = get_access_token()
    if not access_token:
        raise ValueError("Access token is required for this operation.")

    user_info = AuthProvider.parse_user_info(access_token.claims)
    if not user_info or not user_info.id:
        raise ValueError(f"Hello, unknown! Your scopes are: {', '.join(access_token.scopes)}")
    return user_info


def register_manage_tools(mcp: FastMCP) -> None:
    """Register all MCP tool management functions with the MCP server."""

    @mcp.tool
    async def create_tool(
        name: str,
        description: str,
        code_content: str,
        requirements: str = "",
    ) -> dict[str, Any]:
        """
        Create a new tool (script/module) with all its functions.

        Args:
            name: Tool name (script/module name)
            description: Tool description
            code_content: Python code containing multiple functions
            requirements: Requirements.txt content (default: "")

        Returns:
            dictionary containing creation result and tool information
        """
        user_info = get_current_user()

        try:
            if not name or not description or not code_content:
                return error_response("Missing required fields: name, description, code_content")

            try:
                functions = discover_functions_from_code(code_content)
                if not functions:
                    return error_response(
                        "No functions found in code. Make sure functions don't start with underscore."
                    )
            except ValueError as e:
                return error_response(str(e))

            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Check if tool name already exists
                existing_tool = await repo.get_tool_by_user_and_name(user_info.id, name)
                if existing_tool:
                    return error_response(f"Tool with name '{name}' already exists")

                # Create Tool record using ToolCreate pattern
                tool_create = ToolCreate(
                    user_id=user_info.id,
                    name=name,
                    description=description,
                    tags_json="[]",
                    is_active=True,
                )
                tool = await repo.create_tool(tool_create, user_info.id)

                # Create ToolVersion record
                tool_version_create = ToolVersionCreate(
                    user_id=user_info.id,
                    version=1,
                    requirements=requirements,
                    code_content=code_content,
                    status=ToolStatus.READY,
                    tool_id=tool.id,
                )
                tool_version = await repo.create_tool_version(tool_version_create, user_info.id)

                # Create ToolFunction records for each discovered function
                created_functions = []
                for func_info in functions:
                    schemas = generate_basic_schema(func_info)

                    tool_function_create = ToolFunctionCreate(
                        user_id=user_info.id,
                        function_name=func_info["name"],
                        docstring=func_info["docstring"],
                        input_schema=schemas["input_schema"],
                        output_schema=schemas["output_schema"],
                        tool_version_id=tool_version.id,
                    )
                    await repo.create_tool_function(tool_function_create, user_info.id)
                    created_functions.append(func_info["name"])

                await session.commit()

                # Refresh tools in the loader
                try:
                    tools = await tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after creating {name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after creating {name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{name}' created successfully",
                    "tool_id": tool.id,
                    "version": 1,
                    "functions": created_functions,
                }

        except Exception as e:
            logger.error(f"Error creating tool '{name}': {e}")
            return error_response(f"Error creating tool: {str(e)}")

    _ = create_tool

    @mcp.tool
    async def create_function(tool_name: str, code_content: str) -> dict[str, Any]:
        """
        Add new function(s) to an existing tool by providing code content.
        The new code will be appended to the existing tool's code content.
        All functions discovered in the new code will be added to the tool.

        Args:
            tool_name: Name of the tool to add function to
            code_content: Python code containing one or more functions to add

        Returns:
            dictionary containing creation result
        """
        user_info = get_current_user()
        try:
            # Basic validation
            if not code_content:
                return error_response("Missing required field: code_content")

            # Discover functions in the code
            try:
                functions = discover_functions_from_code(code_content)
                if not functions:
                    return error_response(
                        "No functions found in code. Make sure functions don't start with underscore."
                    )
            except ValueError as e:
                return error_response(str(e))

            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool by name and user_id
                tool = await repo.get_tool_by_user_and_name(user_info.id, tool_name)
                if not tool:
                    return error_response(f"Tool '{tool_name}' not found")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool.id)
                if not latest_version:
                    return error_response(f"No versions found for tool '{tool_name}'")

                # Check if any of the functions already exist
                existing_functions = await repo.get_functions_by_names(
                    latest_version.id, [f["name"] for f in functions]
                )

                if existing_functions:
                    existing_names = [f.function_name for f in existing_functions]
                    return error_response(f"Function(s) already exist in tool '{tool.name}': {existing_names}")

                # Combine existing code with new code content
                combined_code_content = latest_version.code_content + "\n\n" + code_content

                try:
                    discover_functions_from_code(combined_code_content)
                except ValueError as e:
                    return error_response(f"Invalid syntax when combining code: {str(e)}")

                # Create new version with combined code
                tool_version_create = ToolVersionCreate(
                    user_id=user_info.id,
                    version=latest_version.version + 1,
                    requirements=latest_version.requirements,
                    code_content=combined_code_content,
                    status=ToolStatus.READY,
                    tool_id=tool.id,
                )
                new_version = await repo.create_tool_version(tool_version_create, user_info.id)

                # Create ToolFunction records for each discovered function
                created_functions = []
                for func_info in functions:
                    schemas = generate_basic_schema(func_info)

                    tool_function_create = ToolFunctionCreate(
                        user_id=user_info.id,
                        function_name=func_info["name"],
                        docstring=func_info["docstring"],
                        input_schema=schemas["input_schema"],
                        output_schema=schemas["output_schema"],
                        tool_version_id=new_version.id,
                    )
                    await repo.create_tool_function(tool_function_create, user_info.id)
                    created_functions.append(func_info["name"])

                await session.commit()

                # Refresh tools in the loader
                try:
                    tools = await tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after adding functions {created_functions} to {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after adding function: {e}")

                return {
                    "status": "success",
                    "message": f"Function(s) added to tool '{tool.name}' successfully",
                    "tool_name": tool.name,
                    "functions": created_functions,
                    "version": new_version.version,
                }

        except Exception as e:
            logger.error(f"Error adding function(s) to tool '{tool_name}': {e}")
            return error_response(f"Error adding function(s): {str(e)}")

    _ = create_function

    @mcp.tool
    async def update_tool(
        tool_name: str,
        name: str | None = None,
        description: str | None = None,
        code_content: str | None = None,
        requirements: str | None = None,
    ) -> dict[str, Any]:
        """
        Update an existing tool.

        Args:
            tool_name: Name of the tool to update
            name: New tool name (optional)
            description: New description (optional)
            code_content: New Python code (optional)
            requirements: New requirements (optional)

        Returns:
            dictionary containing update result
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool by name and user_id
                tool = await repo.get_tool_by_user_and_name(user_info.id, tool_name)
                if not tool:
                    return error_response(f"Tool '{tool_name}' not found")

                # Update tool fields if provided
                update_data = ToolUpdate()
                if name is not None:
                    # Check if new name conflicts with existing tools for this user
                    existing_tool = await repo.get_tool_by_user_and_name(user_info.id, name)
                    if existing_tool and existing_tool.id != tool.id:
                        return error_response(f"Tool with name '{name}' already exists")
                    update_data.name = name

                if description is not None:
                    update_data.description = description

                # Update tool if any fields were changed
                if update_data.model_fields_set:
                    tool = await repo.update_tool(tool.id, update_data)
                    if not tool:
                        return error_response(f"Failed to update tool '{tool_name}'")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool.id)
                if not latest_version:
                    return error_response(f"No versions found for tool '{tool_name}'")

                # Create new version if code or requirements are updated
                new_version = latest_version
                if code_content is not None or requirements is not None:
                    # Validate code if provided
                    if code_content:
                        try:
                            discover_functions_from_code(code_content)
                        except ValueError as e:
                            return error_response(str(e))

                    # Create new ToolVersion
                    tool_version_create = ToolVersionCreate(
                        user_id=user_info.id,
                        version=latest_version.version + 1,
                        requirements=requirements if requirements is not None else latest_version.requirements,
                        code_content=code_content if code_content is not None else latest_version.code_content,
                        status=ToolStatus.READY,
                        tool_id=tool.id,
                    )
                    new_version = await repo.create_tool_version(tool_version_create, user_info.id)

                    # Re-discover functions and create ToolFunction records
                    if code_content:
                        try:
                            functions = discover_functions_from_code(code_content)
                            for func_info in functions:
                                schemas = generate_basic_schema(func_info)

                                tool_function_create = ToolFunctionCreate(
                                    user_id=user_info.id,
                                    function_name=func_info["name"],
                                    docstring=func_info["docstring"],
                                    input_schema=schemas["input_schema"],
                                    output_schema=schemas["output_schema"],
                                    tool_version_id=new_version.id,
                                )
                                await repo.create_tool_function(tool_function_create, user_info.id)
                        except ValueError as e:
                            return error_response(str(e))

                await session.commit()

                # Refresh tools in the loader
                try:
                    tools = await tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after updating {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after updating {tool.name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool.name}' updated successfully",
                    "tool_name": tool.name,
                    "version": new_version.version,
                }

        except Exception as e:
            logger.error(f"Error updating tool '{tool_name}': {e}")
            return error_response(f"Error updating tool: {str(e)}")

    _ = update_tool

    @mcp.tool
    async def update_function(tool_id: uuid.UUID, function_name: str, code_content: str) -> dict[str, Any]:
        """
        Update a function in an existing tool by providing new code content.
        The new code will be appended to the existing tool's code content.
        The specified function will be updated with new implementation and schema.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to update
            code_content: Python code containing the updated function

        Returns:
            dictionary containing update result
        """
        user_info = get_current_user()

        try:
            # Basic validation
            if not code_content:
                return error_response("Missing required field: code_content")

            # Discover functions in the code
            try:
                functions = discover_functions_from_code(code_content)
                if not functions:
                    return error_response(
                        "No functions found in code. Make sure functions don't start with underscore."
                    )
            except ValueError as e:
                return error_response(str(e))

            # Check if the specified function exists in the new code
            function_names = [f["name"] for f in functions]
            if function_name not in function_names:
                return error_response(
                    f"Function '{function_name}' not found in provided code. Available functions: {function_names}"
                )

            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool
                tool = await repo.get_tool_by_id(tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to update this tool")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool_id)
                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Check if function exists in the current tool
                existing_function = await repo.get_tool_function_by_version_and_name(latest_version.id, function_name)
                if not existing_function:
                    return error_response(f"Function '{function_name}' not found in tool '{tool.name}'")

                # Combine existing code with new code content
                combined_code_content = latest_version.code_content + "\n\n" + code_content

                # Validate the combined code for syntax errors
                try:
                    discover_functions_from_code(combined_code_content)
                except ValueError as e:
                    return error_response(f"Invalid syntax when combining code: {str(e)}")

                # Create new version with combined code
                tool_version_create = ToolVersionCreate(
                    user_id=user_info.id,
                    version=latest_version.version + 1,
                    requirements=latest_version.requirements,
                    code_content=combined_code_content,  # Combined code
                    status=ToolStatus.READY,
                    tool_id=tool_id,
                )
                new_version = await repo.create_tool_version(tool_version_create, user_info.id)

                # Get the updated function info from the new code
                updated_function_info = None
                for func_info in functions:
                    if func_info["name"] == function_name:
                        updated_function_info = func_info
                        break

                if not updated_function_info:
                    return error_response(f"Function '{function_name}' not found in provided code")

                # Generate new schemas for the updated function
                schemas = generate_basic_schema(updated_function_info)

                # Create updated ToolFunction record
                tool_function_create = ToolFunctionCreate(
                    user_id=user_info.id,
                    function_name=updated_function_info["name"],
                    docstring=updated_function_info["docstring"],
                    input_schema=schemas["input_schema"],
                    output_schema=schemas["output_schema"],
                    tool_version_id=new_version.id,
                )
                await repo.create_tool_function(tool_function_create, user_info.id)

                await session.commit()

                # Refresh tools in the loader
                try:
                    tools = await tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after updating function {function_name} in {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after updating function: {e}")

                return {
                    "status": "success",
                    "message": f"Function '{function_name}' updated successfully",
                    "tool_id": tool_id,
                    "function_name": function_name,
                    "version": new_version.version,
                }

        except Exception as e:
            logger.error(f"Error updating function '{function_name}' in tool {tool_id}: {e}")
            return error_response(f"Error updating function: {str(e)}")

    _ = update_function

    @mcp.tool
    async def delete_tool(tool_id: uuid.UUID) -> dict[str, Any]:
        """
        Delete an entire tool and all its functions.

        Args:
            tool_id: ID of the tool to delete

        Returns:
            dictionary containing deletion result
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool
                tool = await repo.get_tool_by_id(tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to delete this tool")

                tool_name = tool.name

                # Use repository method to hard delete tool and all related records
                success = await repo.hard_delete_tool(tool_id)
                if not success:
                    return error_response(f"Failed to delete tool with ID {tool_id}")

                await session.commit()

                # Refresh tools in the loader using the new refresh method
                try:
                    result = await tool_loader.refresh_tools(mcp, user_id=user_info.id)
                    logger.info(f"Refreshed tools after deleting {tool_name}: {result}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after deleting {tool_name}: {e}")
                    return error_response(f"Tool '{tool_name}' deleted but failed to refresh tools: {str(e)}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool_name}' deleted successfully",
                    "tool_id": tool_id,
                }

        except Exception as e:
            logger.error(f"Error deleting tool {tool_id}: {e}")
            return error_response(f"Error deleting tool: {str(e)}")

    _ = delete_tool

    @mcp.tool
    async def delete_function(tool_id: uuid.UUID, function_name: str) -> dict[str, Any]:
        """
        Delete a specific function from a tool.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to delete

        Returns:
            dictionary containing deletion result
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool
                tool = await repo.get_tool_by_id(tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to modify this tool")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool_id)
                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Find the function
                tool_function = await repo.get_tool_function_by_version_and_name(latest_version.id, function_name)
                if not tool_function:
                    return error_response(f"Function '{function_name}' not found in tool '{tool.name}'")

                # Delete the function
                success = await repo.delete_tool_function(tool_function.id)
                if not success:
                    return error_response(f"Failed to delete function '{function_name}'")

                await session.commit()

                # Refresh tools in the loader
                try:
                    tools = await tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after deleting function {function_name} from {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after deleting function: {e}")

                return {
                    "status": "success",
                    "message": f"Function '{function_name}' deleted from tool '{tool.name}' successfully",
                    "tool_id": tool_id,
                    "function_name": function_name,
                }

        except Exception as e:
            logger.error(f"Error deleting function '{function_name}' from tool {tool_id}: {e}")
            return error_response(f"Error deleting function: {str(e)}")

    _ = delete_function

    @mcp.tool
    async def list_tool_functions(tool_id: uuid.UUID) -> dict[str, Any]:
        """
        List all functions in a specific tool.

        Args:
            tool_id: ID of the tool

        Returns:
            dictionary containing tool functions information
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool
                tool = await repo.get_tool_by_id(tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to view this tool")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool_id)
                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Get all functions for this version
                functions = await repo.list_tool_functions_by_version(latest_version.id)

                function_list: list[dict[str, Any]] = []
                for func in functions:
                    function_list.append(
                        {
                            "function_name": func.function_name,
                            "docstring": func.docstring,
                            "input_schema": func.input_schema,
                            "output_schema": func.output_schema,
                        }
                    )

                return {
                    "status": "success",
                    "tool_id": tool_id,
                    "tool_name": tool.name,
                    "version": latest_version.version,
                    "functions": function_list,
                    "function_count": len(function_list),
                }

        except Exception as e:
            logger.error(f"Error listing functions for tool {tool_id}: {e}")
            return error_response(f"Error listing functions: {str(e)}")

    _ = list_tool_functions

    @mcp.tool
    async def get_tool_info(tool_id: uuid.UUID) -> dict[str, Any]:
        """
        Get complete information about a tool and its functions.

        Args:
            tool_id: ID of the tool

        Returns:
            dictionary containing complete tool information
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get the tool
                tool = await repo.get_tool_by_id(tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to view this tool")

                # Get the latest version
                latest_version = await repo.get_latest_tool_version(tool_id)
                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Get all functions for this version
                functions = await repo.list_tool_functions_by_version(latest_version.id)

                function_list: list[dict[str, Any]] = []
                for func in functions:
                    function_list.append(
                        {
                            "function_name": func.function_name,
                            "docstring": func.docstring,
                            "input_schema": func.input_schema,
                            "output_schema": func.output_schema,
                        }
                    )

                return {
                    "status": "success",
                    "tool_id": tool_id,
                    "tool_name": tool.name,
                    "description": tool.description,
                    "is_active": tool.is_active,
                    "created_at": tool.created_at.isoformat() if tool.created_at else None,
                    "updated_at": tool.updated_at.isoformat() if tool.updated_at else None,
                    "version": latest_version.version,
                    "requirements": latest_version.requirements,
                    "code_content": latest_version.code_content,
                    "tool_status": latest_version.status,
                    "functions": function_list,
                    "function_count": len(function_list),
                }

        except Exception as e:
            logger.error(f"Error getting tool info for {tool_id}: {e}")
            return error_response(f"Error getting tool info: {str(e)}")

    _ = get_tool_info

    @mcp.tool
    async def get_tool_changes(hours: int = 24) -> dict[str, Any]:
        """
        Get recent tool changes from the database.

        Args:
            hours: Number of hours to look back for changes (default: 24)

        Returns:
            dictionary containing recent tool changes
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Calculate time threshold
                time_threshold = datetime.now() - timedelta(hours=hours)

                # Query recent tool changes using repository methods
                recent_tools = await repo.get_tools_updated_since(user_info.id, time_threshold, limit=50)

                # Query recent tool versions using repository methods
                recent_versions = await repo.get_tool_versions_created_since(user_info.id, time_threshold, limit=50)

                # Format tool changes
                tool_changes: list[dict[str, Any]] = []
                for tool in recent_tools:
                    tool_changes.append(
                        {
                            "tool_id": tool.id,
                            "tool_name": tool.name,
                            "change_type": "updated",
                            "updated_at": tool.updated_at.isoformat() if tool.updated_at else None,
                            "description": tool.description,
                            "is_active": tool.is_active,
                        }
                    )

                # Format version changes
                version_changes: list[dict[str, Any]] = []
                for version in recent_versions:
                    # Get the tool for this version
                    tool_for_version = await repo.get_tool_by_id(version.tool_id)
                    if tool_for_version:
                        version_changes.append(
                            {
                                "tool_id": version.tool_id,
                                "tool_name": tool_for_version.name,
                                "change_type": "version_created",
                                "version": version.version,
                                "status": version.status,
                                "created_at": version.created_at.isoformat() if version.created_at else None,
                                "requirements": version.requirements,
                            }
                        )

                # Get function count for each tool
                tool_function_counts = {}
                for tool in recent_tools:
                    latest_version = await repo.get_latest_tool_version(tool.id)
                    if latest_version:
                        functions = await repo.list_tool_functions_by_version(latest_version.id)
                        tool_function_counts[str(tool.id)] = len(functions)

                return {
                    "status": "success",
                    "time_range_hours": hours,
                    "tool_changes": tool_changes,
                    "version_changes": version_changes,
                    "summary": {
                        "tools_updated": len(tool_changes),
                        "versions_created": len(version_changes),
                        "total_changes": len(tool_changes) + len(version_changes),
                    },
                    "tool_function_counts": tool_function_counts,
                }

        except Exception as e:
            logger.error(f"Error getting tool changes: {e}")
            return error_response(f"Error getting tool changes: {str(e)}")

    _ = get_tool_changes

    @mcp.tool
    async def get_tool_statistics() -> dict[str, Any]:
        """
        Get comprehensive tool statistics from the database.

        Returns:
            dictionary containing tool statistics
        """
        user_info = get_current_user()

        try:
            async with AsyncSessionLocal() as session:
                repo = ToolRepository(session)

                # Get total tools count
                total_tools = await repo.list_tools_by_user(user_info.id, limit=10000)  # High limit to get all

                # Get active tools count
                active_tools = await repo.list_tools_by_user(user_info.id, is_active=True, limit=10000)

                # Get total versions count
                total_versions = await repo.get_all_tool_versions_by_user(user_info.id)

                # Get total functions count
                total_functions = await repo.get_all_tool_functions_by_user(user_info.id)

                # Get tools by status
                tools_by_status: dict[str, int] = {}
                for tool in total_tools:
                    latest_version = await repo.get_latest_tool_version(tool.id)
                    if latest_version:
                        status = latest_version.status.value
                        tools_by_status[status] = tools_by_status.get(status, 0) + 1

                # Get recent activity (last 7 days)
                week_ago = datetime.now() - timedelta(days=7)
                recent_activity = await repo.get_tools_updated_since(user_info.id, week_ago, limit=1000)

                return {
                    "status": "success",
                    "statistics": {
                        "total_tools": len(total_tools),
                        "active_tools": len(active_tools),
                        "inactive_tools": len(total_tools) - len(active_tools),
                        "total_versions": len(total_versions),
                        "total_functions": len(total_functions),
                        "tools_by_status": tools_by_status,
                        "recent_activity_7_days": len(recent_activity),
                    },
                    "tool_list": [
                        {
                            "tool_id": tool.id,
                            "name": tool.name,
                            "description": tool.description,
                            "is_active": tool.is_active,
                            "created_at": tool.created_at.isoformat() if tool.created_at else None,
                            "updated_at": tool.updated_at.isoformat() if tool.updated_at else None,
                        }
                        for tool in total_tools
                    ],
                }

        except Exception as e:
            logger.error(f"Error getting tool statistics: {e}")
            return error_response(f"Error getting tool statistics: {str(e)}")

    _ = get_tool_statistics
