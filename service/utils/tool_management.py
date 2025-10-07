"""
MCP Tool Management - Tool and function management for MCP server

This module provides functions for managing tools and functions in the MCP server:
- Creating and updating tools (scripts/modules)
- Creating and updating individual functions
- Managing tool-function relationships
- MCP registration and discovery
"""

import ast
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP
from sqlmodel import Session, desc, select, true

from middleware.database.connection import engine
from models.tool import Tool, ToolFunction, ToolStatus, ToolVersion
from utils.tool_loader import tool_loader

logger = logging.getLogger(__name__)


def discover_functions_from_code(code_content: str) -> List[Dict[str, Any]]:
    """
    Discover all callable functions in Python code using AST parsing.

    Args:
        code_content: Python code to analyze

    Returns:
        List of function metadata dictionaries
    """
    try:
        tree = ast.parse(code_content)
        functions = []

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if not node.name.startswith("_"):  # Skip private functions
                    # Extract function signature info
                    args = []
                    for arg in node.args.args:
                        args.append(
                            {
                                "name": arg.arg,
                                "annotation": ast.unparse(arg.annotation) if arg.annotation else None,
                            }
                        )

                    functions.append(
                        {
                            "name": node.name,
                            "docstring": ast.get_docstring(node) or f"Function {node.name}",
                            "args": args,
                            "line_number": node.lineno,
                            "return_annotation": ast.unparse(node.returns) if node.returns else None,
                        }
                    )

        return functions
    except SyntaxError as e:
        raise ValueError(f"Invalid Python syntax: {e}")
    except Exception as e:
        raise ValueError(f"Error analyzing code: {e}")


def generate_basic_schema(function_info: Dict[str, Any]) -> Dict[str, str]:
    """
    Generate basic JSON schemas for a function.

    Args:
        function_info: Function metadata from discover_functions_from_code

    Returns:
        Dictionary with 'input_schema' and 'output_schema' keys
    """
    # Generate input schema
    properties = {}
    required = []

    for arg in function_info["args"]:
        arg_name = arg["name"]
        arg_type = arg.get("annotation", "Any")

        # Map Python types to JSON schema types
        if arg_type == "str" or "str" in str(arg_type):
            properties[arg_name] = {"type": "string"}
        elif arg_type == "int" or "int" in str(arg_type):
            properties[arg_name] = {"type": "integer"}
        elif arg_type == "float" or "float" in str(arg_type):
            properties[arg_name] = {"type": "number"}
        elif arg_type == "bool" or "bool" in str(arg_type):
            properties[arg_name] = {"type": "boolean"}
        elif arg_type == "list" or "List" in str(arg_type):
            properties[arg_name] = {"type": "array"}
        elif arg_type == "dict" or "Dict" in str(arg_type):
            properties[arg_name] = {"type": "object"}
        else:
            properties[arg_name] = {"type": "string"}  # Default to string

        required.append(arg_name)

    input_schema = {"type": "object", "properties": properties, "required": required}

    # Generate output schema
    return_type = function_info.get("return_annotation", "Any")
    if return_type == "str" or "str" in str(return_type):
        output_schema = {"type": "string"}
    elif return_type == "int" or "int" in str(return_type):
        output_schema = {"type": "integer"}
    elif return_type == "float" or "float" in str(return_type):
        output_schema = {"type": "number"}
    elif return_type == "bool" or "bool" in str(return_type):
        output_schema = {"type": "boolean"}
    elif return_type == "list" or "List" in str(return_type):
        output_schema = {"type": "array"}
    elif return_type == "dict" or "Dict" in str(return_type):
        output_schema = {"type": "object"}
    else:
        output_schema = {"type": "string"}  # Default to string

    return {
        "input_schema": json.dumps(input_schema),
        "output_schema": json.dumps(output_schema),
    }


def register_tool_management_tools(mcp: FastMCP) -> None:
    """Register all MCP tool management functions with the MCP server."""

    @mcp.tool
    def create_tool(
        name: str,
        description: str,
        code_content: str,
        requirements: str = "",
        user_id: str = "system",
    ) -> Dict[str, Any]:
        """
        Create a new tool (script/module) with all its functions.

        Args:
            name: Tool name (script/module name)
            description: Tool description
            code_content: Python code containing multiple functions
            requirements: Requirements.txt content (default: "")
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing creation result and tool information
        """
        try:
            # Basic validation
            if not name or not description or not code_content:
                return {
                    "status": "error",
                    "message": "Missing required fields: name, description, code_content",
                }

            # Discover functions in the code
            try:
                functions = discover_functions_from_code(code_content)
                if not functions:
                    return {
                        "status": "error",
                        "message": "No functions found in code. Make sure functions don't start with underscore.",
                    }
            except ValueError as e:
                return {"status": "error", "message": str(e)}

            with Session(engine) as session:
                # Check if tool name already exists
                existing_tool = session.exec(select(Tool).where(Tool.name == name)).first()
                if existing_tool:
                    return {
                        "status": "error",
                        "message": f"Tool with name '{name}' already exists",
                    }

                # Create Tool record
                tool = Tool(
                    user_id=user_id,
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
                    user_id=user_id,
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
                        user_id=user_id,
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
                    tools = tool_loader.scan_and_load_tools()
                    tool_loader.register_tools_to_mcp(mcp, tools)
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
            return {"status": "error", "message": f"Error creating tool: {str(e)}"}

    @mcp.tool
    def create_function(
        tool_id: int,
        function_name: str,
        code_content: str,
        input_schema: str = "{}",
        output_schema: str = "{}",
        user_id: str = "system",
    ) -> Dict[str, Any]:
        """
        Add a new function to an existing tool.

        Args:
            tool_id: ID of the tool to add function to
            function_name: Name of the function to add
            code_content: Python code containing the function
            input_schema: JSON schema for input parameters (default: "{}")
            output_schema: JSON schema for output (default: "{}")
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing creation result
        """
        try:
            # Basic validation
            if not function_name or not code_content:
                return {
                    "status": "error",
                    "message": "Missing required fields: function_name, code_content",
                }

            # Validate JSON schemas
            try:
                json.loads(input_schema)
                json.loads(output_schema)
            except json.JSONDecodeError as e:
                return {"status": "error", "message": f"Invalid JSON schema: {str(e)}"}

            # Check if function exists in code
            try:
                functions = discover_functions_from_code(code_content)
                function_names = [f["name"] for f in functions]
                if function_name not in function_names:
                    return {
                        "status": "error",
                        "message": (
                            f"Function '{function_name}' not found in code. " f"Available functions: {function_names}"
                        ),
                    }
            except ValueError as e:
                return {"status": "error", "message": str(e)}

            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to modify this tool",
                    }

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

                # Check if function already exists
                existing_function = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name == function_name,
                    )
                ).first()

                if existing_function:
                    return {
                        "status": "error",
                        "message": f"Function '{function_name}' already exists in tool '{tool.name}'",
                    }

                # Create new version with updated code
                new_version = ToolVersion(
                    user_id=user_id,
                    version=latest_version.version + 1,
                    requirements=latest_version.requirements,
                    code_content=code_content,  # Updated code
                    status=ToolStatus.READY,
                    tool_id=tool_id,
                )
                session.add(new_version)
                session.commit()
                session.refresh(new_version)

                # Create ToolFunction record
                tool_function = ToolFunction(
                    user_id=user_id,
                    function_name=function_name,
                    docstring=f"Function {function_name}",
                    input_schema=input_schema,
                    output_schema=output_schema,
                    tool_version_id=new_version.id,
                )
                session.add(tool_function)
                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools()
                    tool_loader.register_tools_to_mcp(mcp, tools)
                    logger.info(f"Refreshed tools after adding function {function_name} to {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after adding function: {e}")

                return {
                    "status": "success",
                    "message": f"Function '{function_name}' added to tool '{tool.name}' successfully",
                    "tool_id": tool_id,
                    "function_name": function_name,
                    "version": new_version.version,
                }

        except Exception as e:
            logger.error(f"Error adding function '{function_name}' to tool {tool_id}: {e}")
            return {"status": "error", "message": f"Error adding function: {str(e)}"}

    @mcp.tool
    def update_tool(
        tool_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        code_content: Optional[str] = None,
        requirements: Optional[str] = None,
        user_id: str = "system",
    ) -> Dict[str, Any]:
        """
        Update an existing tool.

        Args:
            tool_id: ID of the tool to update
            name: New tool name (optional)
            description: New description (optional)
            code_content: New Python code (optional)
            requirements: New requirements (optional)
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing update result
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to update this tool",
                    }

                # Update tool fields if provided
                if name is not None:
                    # Check if new name conflicts with existing tools
                    existing_tool = session.exec(select(Tool).where(Tool.name == name, Tool.id != tool_id)).first()
                    if existing_tool:
                        return {
                            "status": "error",
                            "message": f"Tool with name '{name}' already exists",
                        }
                    tool.name = name

                if description is not None:
                    tool.description = description

                session.add(tool)

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

                # Create new version if code or requirements are updated
                if code_content is not None or requirements is not None:
                    # Validate code if provided
                    if code_content:
                        try:
                            discover_functions_from_code(code_content)
                        except ValueError as e:
                            return {"status": "error", "message": str(e)}

                    next_version = latest_version.version + 1

                    # Create new ToolVersion
                    new_version = ToolVersion(
                        user_id=user_id,
                        version=next_version,
                        requirements=requirements if requirements is not None else latest_version.requirements,
                        code_content=code_content if code_content is not None else latest_version.code_content,
                        status=ToolStatus.READY,
                        tool_id=tool_id,
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
                                    user_id=user_id,
                                    function_name=func_info["name"],
                                    docstring=func_info["docstring"],
                                    input_schema=schemas["input_schema"],
                                    output_schema=schemas["output_schema"],
                                    tool_version_id=new_version.id,
                                )
                                session.add(tool_function)
                        except ValueError as e:
                            return {"status": "error", "message": str(e)}

                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools()
                    tool_loader.register_tools_to_mcp(mcp, tools)
                    logger.info(f"Refreshed tools after updating {tool.name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after updating {tool.name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool.name}' updated successfully",
                    "tool_id": tool.id,
                    "version": (
                        latest_version.version + 1
                        if code_content is not None or requirements is not None
                        else latest_version.version
                    ),
                }

        except Exception as e:
            logger.error(f"Error updating tool {tool_id}: {e}")
            return {"status": "error", "message": f"Error updating tool: {str(e)}"}

    @mcp.tool
    def update_function(
        tool_id: int,
        function_name: str,
        input_schema: Optional[str] = None,
        output_schema: Optional[str] = None,
        user_id: str = "system",
    ) -> Dict[str, Any]:
        """
        Update a function's schema in an existing tool.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to update
            input_schema: New input schema (optional)
            output_schema: New output schema (optional)
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing update result
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to update this tool",
                    }

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

                # Find the function
                tool_function = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name == function_name,
                    )
                ).first()

                if not tool_function:
                    return {
                        "status": "error",
                        "message": f"Function '{function_name}' not found in tool '{tool.name}'",
                    }

                # Validate schemas if provided
                if input_schema:
                    try:
                        json.loads(input_schema)
                    except json.JSONDecodeError as e:
                        return {
                            "status": "error",
                            "message": f"Invalid input schema JSON: {str(e)}",
                        }

                if output_schema:
                    try:
                        json.loads(output_schema)
                    except json.JSONDecodeError as e:
                        return {
                            "status": "error",
                            "message": f"Invalid output schema JSON: {str(e)}",
                        }

                # Update function schemas
                if input_schema is not None:
                    tool_function.input_schema = input_schema
                if output_schema is not None:
                    tool_function.output_schema = output_schema

                session.add(tool_function)
                session.commit()

                return {
                    "status": "success",
                    "message": f"Function '{function_name}' updated successfully",
                    "tool_id": tool_id,
                    "function_name": function_name,
                }

        except Exception as e:
            logger.error(f"Error updating function '{function_name}' in tool {tool_id}: {e}")
            return {"status": "error", "message": f"Error updating function: {str(e)}"}

    @mcp.tool
    def delete_tool(tool_id: int, user_id: str = "system") -> Dict[str, Any]:
        """
        Delete an entire tool and all its functions.

        Args:
            tool_id: ID of the tool to delete
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing deletion result
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to delete this tool",
                    }

                tool_name = tool.name

                # Delete the tool (cascading deletes will handle versions and functions)
                session.delete(tool)
                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools()
                    tool_loader.register_tools_to_mcp(mcp, tools)
                    logger.info(f"Refreshed tools after deleting {tool_name}")
                except Exception as e:
                    logger.warning(f"Failed to refresh tools after deleting {tool_name}: {e}")

                return {
                    "status": "success",
                    "message": f"Tool '{tool_name}' deleted successfully",
                    "tool_id": tool_id,
                }

        except Exception as e:
            logger.error(f"Error deleting tool {tool_id}: {e}")
            return {"status": "error", "message": f"Error deleting tool: {str(e)}"}

    @mcp.tool
    def delete_function(tool_id: int, function_name: str, user_id: str = "system") -> Dict[str, Any]:
        """
        Delete a specific function from a tool.

        Args:
            tool_id: ID of the tool containing the function
            function_name: Name of the function to delete
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing deletion result
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to modify this tool",
                    }

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

                # Find the function
                tool_function = session.exec(
                    select(ToolFunction).where(
                        ToolFunction.tool_version_id == latest_version.id,
                        ToolFunction.function_name == function_name,
                    )
                ).first()

                if not tool_function:
                    return {
                        "status": "error",
                        "message": f"Function '{function_name}' not found in tool '{tool.name}'",
                    }

                # Delete the function
                session.delete(tool_function)
                session.commit()

                # Refresh tools in the loader
                try:
                    tools = tool_loader.scan_and_load_tools()
                    tool_loader.register_tools_to_mcp(mcp, tools)
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
            return {"status": "error", "message": f"Error deleting function: {str(e)}"}

    @mcp.tool
    def list_tool_functions(tool_id: int, user_id: str = "system") -> Dict[str, Any]:
        """
        List all functions in a specific tool.

        Args:
            tool_id: ID of the tool
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing tool functions information
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to view this tool",
                    }

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

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
            return {"status": "error", "message": f"Error listing functions: {str(e)}"}

    @mcp.tool
    def get_tool_info(tool_id: int, user_id: str = "system") -> Dict[str, Any]:
        """
        Get complete information about a tool and its functions.

        Args:
            tool_id: ID of the tool
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing complete tool information
        """
        try:
            with Session(engine) as session:
                # Get the tool
                tool = session.get(Tool, tool_id)
                if not tool:
                    return {
                        "status": "error",
                        "message": f"Tool with ID {tool_id} not found",
                    }

                # Check if user has permission
                if tool.user_id != user_id and user_id != "system":
                    return {
                        "status": "error",
                        "message": "Permission denied: You don't have permission to view this tool",
                    }

                # Get the latest version
                latest_version = session.exec(
                    select(ToolVersion).where(ToolVersion.tool_id == tool_id).order_by(desc(ToolVersion.version))
                ).first()

                if not latest_version:
                    return {
                        "status": "error",
                        "message": f"No versions found for tool {tool_id}",
                    }

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
            return {"status": "error", "message": f"Error getting tool info: {str(e)}"}

    @mcp.tool
    def get_tool_changes(hours: int = 24, user_id: str = "system") -> Dict[str, Any]:
        """
        Get recent tool changes from the database.

        Args:
            hours: Number of hours to look back for changes (default: 24)
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing recent tool changes
        """
        try:
            with Session(engine) as session:
                # Calculate time threshold
                time_threshold = datetime.now() - timedelta(hours=hours)

                # Query recent tool changes
                recent_tools = session.exec(
                    select(Tool)
                    .where(
                        Tool.updated_at >= time_threshold,
                        Tool.user_id == user_id if user_id != "system" else True,
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
                        Tool.user_id == user_id if user_id != "system" else True,
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
            return {
                "status": "error",
                "message": f"Error getting tool changes: {str(e)}",
            }

    @mcp.tool
    def get_tool_statistics(user_id: str = "system") -> Dict[str, Any]:
        """
        Get comprehensive tool statistics from the database.

        Args:
            user_id: User ID (default: "system")

        Returns:
            Dictionary containing tool statistics
        """
        try:
            with Session(engine) as session:
                # Get total tools count
                total_tools = session.exec(
                    select(Tool).where(Tool.user_id == user_id if user_id != "system" else True)
                ).all()

                # Get active tools count
                active_tools = session.exec(
                    select(Tool).where(
                        Tool.is_active == true(),
                        Tool.user_id == user_id if user_id != "system" else True,
                    )
                ).all()

                # Get total versions count
                total_versions = session.exec(
                    select(ToolVersion).join(Tool).where(Tool.user_id == user_id if user_id != "system" else True)
                ).all()

                # Get total functions count
                total_functions = session.exec(
                    select(ToolFunction)
                    .join(ToolVersion)
                    .join(Tool)
                    .where(Tool.user_id == user_id if user_id != "system" else True)
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
                        Tool.user_id == user_id if user_id != "system" else True,
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
            return {
                "status": "error",
                "message": f"Error getting tool statistics: {str(e)}",
            }
