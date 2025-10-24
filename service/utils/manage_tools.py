"""
MCP Tool Management - Tool and function management for MCP server

This module provides functions for managing tools and functions in the MCP server:
- Creating and updating tools (scripts/modules)
- Creating and updating individual functions
- Managing tool-function relationships
- MCP registration and discovery
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastmcp import FastMCP
from fastmcp.server.dependencies import AccessToken, get_access_token
from sqlmodel import Session, desc, select, true

from middleware.auth import AuthProvider, UserInfo
from middleware.database.connection import engine
from models.tool import Tool, ToolFunction, ToolStatus, ToolVersion
from utils.code_analyzer import discover_functions_from_code, generate_basic_schema
from utils.tool_loader import tool_loader

logger = logging.getLogger(__name__)


def error_response(message: str) -> Dict[str, Any]:
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
    def create_tool(
        name: str,
        description: str,
        code_content: str,
        requirements: str = "",
    ) -> Dict[str, Any]:
        """
        Create a new tool (script/module) with all its functions.

        Args:
            name: Tool name (script/module name)
            description: Tool description
            code_content: Python code containing multiple functions
            requirements: Requirements.txt content (default: "")

        Returns:
            Dictionary containing creation result and tool information
        """
        user_info = get_current_user()

        try:
            # Basic validation
            if not name or not description or not code_content:
                return error_response("Missing required fields: name, description, code_content")

            # Discover functions in the code
            try:
                functions = discover_functions_from_code(code_content)
                if not functions:
                    return error_response(
                        "No functions found in code. Make sure functions don't start with underscore."
                    )
            except ValueError as e:
                return error_response(str(e))

            with Session(engine) as session:
                # Check if tool name already exists
                existing_tool = session.exec(select(Tool).where(Tool.name == name)).first()
                if existing_tool:
                    return error_response(f"Tool with name '{name}' already exists")

                # Create Tool record
                tool = Tool(
                    user_id=user_info.id,
                    name=name,
                    description=description,
                    tags_json="[]",
                    is_active=True,
                )
                session.add(tool)
                session.commit()
                session.refresh(tool)

                # Create ToolVersion record
                tool_version = ToolVersion(
                    user_id=user_info.id,
                    version=1,  # default version
                    requirements=requirements,
                    code_content=code_content,
                    status=ToolStatus.READY,
                    tool_id=tool.id,
                )
                session.add(tool_version)
                session.commit()
                session.refresh(tool_version)

                # Create ToolFunction records for each discovered function
                created_functions = []
                for func_info in functions:
                    schemas = generate_basic_schema(func_info)

                    tool_function = ToolFunction(
                        user_id=user_info.id,
                        function_name=func_info["name"],
                        docstring=func_info["docstring"],
                        input_schema=schemas["input_schema"],
                        output_schema=schemas["output_schema"],
                        tool_version_id=tool_version.id,
                    )
                    session.add(tool_function)
                    created_functions.append(func_info["name"])

                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools(user_id=user_info.id)
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

    @mcp.tool
    def create_function(tool_name: str, code_content: str) -> Dict[str, Any]:
        """
        Add new function(s) to an existing tool by providing code content.
        The new code will be appended to the existing tool's code content.
        All functions discovered in the new code will be added to the tool.

        Args:
            tool_name: Name of the tool to add function to
            code_content: Python code containing one or more functions to add

        Returns:
            Dictionary containing creation result
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

            with Session(engine) as session:
                # Get the tool by name and user_id
                tool = session.exec(select(Tool).where(Tool.user_id == user_info.id, Tool.name == tool_name)).first()

                if not tool:
                    return error_response(f"Tool '{tool_name}' not found")

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool.id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool '{tool_name}'")

                # Check if any of the functions already exist
                existing_functions = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name.in_([f["name"] for f in functions]),  # type: ignore
                    )
                ).all()

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
                new_version = ToolVersion(
                    user_id=user_info.id,
                    version=latest_version.version + 1,
                    requirements=latest_version.requirements,
                    code_content=combined_code_content,  # Combined code
                    status=ToolStatus.READY,
                    tool_id=tool.id,
                )
                session.add(new_version)
                session.commit()
                session.refresh(new_version)

                # Create ToolFunction records for each discovered function
                created_functions = []
                for func_info in functions:
                    schemas = generate_basic_schema(func_info)

                    tool_function = ToolFunction(
                        user_id=user_info.id,
                        function_name=func_info["name"],
                        docstring=func_info["docstring"],
                        input_schema=schemas["input_schema"],
                        output_schema=schemas["output_schema"],
                        tool_version_id=new_version.id,
                    )
                    session.add(tool_function)
                    created_functions.append(func_info["name"])

                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools(user_id=user_info.id)
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

    @mcp.tool
    def update_tool(
        tool_name: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        code_content: Optional[str] = None,
        requirements: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update an existing tool.

        Args:
            tool_name: Name of the tool to update
            name: New tool name (optional)
            description: New description (optional)
            code_content: New Python code (optional)
            requirements: New requirements (optional)

        Returns:
            Dictionary containing update result
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get the tool by name and user_id
                tool = session.exec(select(Tool).where(Tool.user_id == user_info.id, Tool.name == tool_name)).first()

                if not tool:
                    return error_response(f"Tool '{tool_name}' not found")

                # Update tool fields if provided
                if name is not None:
                    # Check if new name conflicts with existing tools for this user
                    existing_tool = session.exec(
                        select(Tool).where(Tool.user_id == user_info.id, Tool.name == name, Tool.id != tool.id)
                    ).first()
                    if existing_tool:
                        return error_response(f"Tool with name '{name}' already exists")
                    tool.name = name

                if description is not None:
                    tool.description = description

                session.add(tool)

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool.id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool '{tool_name}'")

                # Create new version if code or requirements are updated
                if code_content is not None or requirements is not None:
                    # Validate code if provided
                    if code_content:
                        try:
                            discover_functions_from_code(code_content)
                        except ValueError as e:
                            return error_response(str(e))

                    next_version = latest_version.version + 1

                    # Create new ToolVersion
                    new_version = ToolVersion(
                        user_id=user_info.id,
                        version=next_version,
                        requirements=requirements if requirements is not None else latest_version.requirements,
                        code_content=code_content if code_content is not None else latest_version.code_content,
                        status=ToolStatus.READY,
                        tool_id=tool.id,
                    )
                    session.add(new_version)
                    session.commit()
                    session.refresh(new_version)

                    # Re-discover functions and create ToolFunction records
                    if code_content:
                        try:
                            functions = discover_functions_from_code(code_content)
                            for func_info in functions:
                                schemas = generate_basic_schema(func_info)

                                tool_function = ToolFunction(
                                    user_id=user_info.id,
                                    function_name=func_info["name"],
                                    docstring=func_info["docstring"],
                                    input_schema=schemas["input_schema"],
                                    output_schema=schemas["output_schema"],
                                    tool_version_id=new_version.id,
                                )
                                session.add(tool_function)
                        except ValueError as e:
                            return error_response(str(e))

                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools(user_id=user_info.id)
                    tool_loader.register_tools_to_mcp(mcp, tools, user_id=user_info.id)
                    logger.info(f"Refreshed tools after updating {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after updating {tool.name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool.name}' updated successfully",
                    "tool_name": tool.name,
                    "version": (
                        latest_version.version + 1
                        if code_content is not None or requirements is not None
                        else latest_version.version
                    ),
                }

        except Exception as e:
            logger.error(f"Error updating tool '{tool_name}': {e}")
            return error_response(f"Error updating tool: {str(e)}")

    @mcp.tool
    def update_function(tool_id: int, function_name: str, code_content: str) -> Dict[str, Any]:
        """
        Update a function in an existing tool by providing new code content.
        The new code will be appended to the existing tool's code content.
        The specified function will be updated with new implementation and schema.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to update
            code_content: Python code containing the updated function

        Returns:
            Dictionary containing update result
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
                    f"Function '{function_name}' not found in provided code. " f"Available functions: {function_names}"
                )

            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to update this tool")

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Check if function exists in the current tool
                existing_function = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name == function_name,
                    )
                ).first()

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
                new_version = ToolVersion(
                    user_id=user_info.id,
                    version=latest_version.version + 1,
                    requirements=latest_version.requirements,
                    code_content=combined_code_content,  # Combined code
                    status=ToolStatus.READY,
                    tool_id=tool_id,
                )
                session.add(new_version)
                session.commit()
                session.refresh(new_version)

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
                updated_tool_function = ToolFunction(
                    user_id=user_info.id,
                    function_name=updated_function_info["name"],
                    docstring=updated_function_info["docstring"],
                    input_schema=schemas["input_schema"],
                    output_schema=schemas["output_schema"],
                    tool_version_id=new_version.id,
                )
                session.add(updated_tool_function)
                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools(user_id=user_info.id)
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

    @mcp.tool
    def delete_tool(tool_id: int) -> Dict[str, Any]:
        """
        Delete an entire tool and all its functions.

        Args:
            tool_id: ID of the tool to delete

        Returns:
            Dictionary containing deletion result
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to delete this tool")

                tool_name = tool.name

                # Manually delete related records in correct order due to missing CASCADE DELETE
                # First delete all functions for all versions
                for version in tool.versions:
                    for function in version.functions:
                        session.delete(function)

                # Then delete all versions
                for version in tool.versions:
                    session.delete(version)

                # Finally delete the tool itself
                session.delete(tool)
                session.commit()

                # Refresh tools in the loader using the new refresh method
                try:
                    result = tool_loader.refresh_tools(mcp, user_id=user_info.id)
                    logger.info(f"Refreshed tools after deleting {tool_name}: {result}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after deleting {tool_name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool_name}' deleted successfully",
                    "tool_id": tool_id,
                }

        except Exception as e:
            logger.error(f"Error deleting tool {tool_id}: {e}")
            return error_response(f"Error deleting tool: {str(e)}")

    @mcp.tool
    def delete_function(tool_id: int, function_name: str) -> Dict[str, Any]:
        """
        Delete a specific function from a tool.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to delete

        Returns:
            Dictionary containing deletion result
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to modify this tool")

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Find the function
                tool_function = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name == function_name,
                    )
                ).first()

                if not tool_function:
                    return error_response(f"Function '{function_name}' not found in tool '{tool.name}'")

                # Delete the function
                session.delete(tool_function)
                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools(user_id=user_info.id)
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

    @mcp.tool
    def list_tool_functions(tool_id: int) -> Dict[str, Any]:
        """
        List all functions in a specific tool.

        Args:
            tool_id: ID of the tool

        Returns:
            Dictionary containing tool functions information
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to view this tool")

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Get all functions for this version
                functions = session.exec(
                    select(ToolFunction).where(ToolFunction.tool_version_id == latest_version.id)
                ).all()

                function_list = []
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

    @mcp.tool
    def get_tool_info(tool_id: int) -> Dict[str, Any]:
        """
        Get complete information about a tool and its functions.

        Args:
            tool_id: ID of the tool

        Returns:
            Dictionary containing complete tool information
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return error_response(f"Tool with ID {tool_id} not found")

                # Check if user has permission
                if tool.user_id != user_info.id:
                    return error_response("Permission denied: You don't have permission to view this tool")

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return error_response(f"No versions found for tool {tool_id}")

                # Get all functions for this version
                functions = session.exec(
                    select(ToolFunction).where(ToolFunction.tool_version_id == latest_version.id)
                ).all()

                function_list = []
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

    @mcp.tool
    def get_tool_changes(hours: int = 24) -> Dict[str, Any]:
        """
        Get recent tool changes from the database.

        Args:
            hours: Number of hours to look back for changes (default: 24)

        Returns:
            Dictionary containing recent tool changes
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Calculate time threshold
                time_threshold = datetime.now() - timedelta(hours=hours)

                # Query recent tool changes
                recent_tools = session.exec(
                    select(Tool)
                    .where(
                        Tool.updated_at >= time_threshold,
                        Tool.user_id == user_info.id,
                    )
                    .order_by(desc(Tool.updated_at))
                    .limit(50)
                ).all()

                # Query recent tool versions
                recent_versions = session.exec(
                    select(ToolVersion)
                    .join(Tool)
                    .where(
                        ToolVersion.created_at >= time_threshold,
                        Tool.user_id == user_info.id,
                    )
                    .order_by(desc(ToolVersion.created_at))
                    .limit(50)
                ).all()

                # Format tool changes
                tool_changes = []
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
                version_changes = []
                for version in recent_versions:
                    # Get the tool for this version
                    tool_for_version: Optional[Tool] = session.get(Tool, version.tool_id)
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
                    latest_version = session.exec(
                        select(ToolVersion).where(ToolVersion.tool_id == tool.id).order_by(desc(ToolVersion.version))
                    ).first()

                    if latest_version:
                        function_count = session.exec(
                            select(ToolFunction).where(ToolFunction.tool_version_id == latest_version.id)
                        ).all()
                        tool_function_counts[tool.id] = len(function_count)

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

    @mcp.tool
    def get_tool_statistics() -> Dict[str, Any]:
        """
        Get comprehensive tool statistics from the database.

        Returns:
            Dictionary containing tool statistics
        """
        user_info = get_current_user()

        try:
            with Session(engine) as session:
                # Get total tools count
                total_tools = session.exec(select(Tool).where(Tool.user_id == user_info.id)).all()

                # Get active tools count
                active_tools = session.exec(
                    select(Tool).where(
                        Tool.is_active == true(),
                        Tool.user_id == user_info.id,
                    )
                ).all()

                # Get total versions count
                total_versions = session.exec(select(ToolVersion).join(Tool).where(Tool.user_id == user_info.id)).all()

                # Get total functions count
                total_functions = session.exec(
                    select(ToolFunction).join(ToolVersion).join(Tool).where(Tool.user_id == user_info.id)
                ).all()

                # Get tools by status
                tools_by_status: Dict[str, int] = {}
                for tool in total_tools:
                    latest_version = session.exec(
                        select(ToolVersion).where(ToolVersion.tool_id == tool.id).order_by(desc(ToolVersion.version))
                    ).first()

                    if latest_version:
                        status = latest_version.status.value
                        tools_by_status[status] = tools_by_status.get(status, 0) + 1

                # Get recent activity (last 7 days)
                week_ago = datetime.now() - timedelta(days=7)
                recent_activity = session.exec(
                    select(Tool).where(
                        Tool.updated_at >= week_ago,
                        Tool.user_id == user_info.id,
                    )
                ).all()

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
