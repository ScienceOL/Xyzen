import json
import logging
from typing import Any, Dict, Optional

from fastmcp import FastMCP
from fastmcp.tools import FunctionTool

from middleware.database.connection import AsyncSessionLocal
from models.tool import ToolFunction, ToolStatus, ToolVersion
from repo.tool import ToolRepository
from utils.parser import parse_requirements
from utils.tool_proxy import ContainerToolProxy, ToolProxyManager

logger = logging.getLogger(__name__)


class DatabaseToolLoader:
    def __init__(self) -> None:
        logger.info("Initializing DatabaseToolLoader")
        self.proxy_manager = ToolProxyManager()
        # Track which tools belong to which user for ownership verification
        self._tool_ownership: Dict[str, str] = {}  # {tool_name: user_id}

    def _get_requirements(self, tool_version: ToolVersion) -> list[str]:
        """Get requirements for a tool version, parsing from database or materialized file."""
        if tool_version.requirements:
            return parse_requirements(tool_version.requirements)
        else:
            return []

    def _build_tool_data(self, tf: ToolFunction, tool_dir_prefix: str) -> Dict[str, Any]:
        """Adapt DB metadata to FunctionTool model dict expected by MCP registration."""

        # Compose MCP-visible tool name as {tool_dir}-{function}
        name = f"{tool_dir_prefix}-{tf.function_name}"
        description = tf.docstring or name
        parameters = json.loads(tf.input_schema or "{}")
        tool_data = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "enabled": True,
            "function_name": tf.function_name,
        }
        if tf.output_schema and tf.output_schema.strip() and tf.output_schema.strip() != "{}":
            try:
                tool_data["output_schema"] = json.loads(tf.output_schema)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON in output_schema for {name}, skipping.")
        return tool_data

    async def scan_and_load_tools(
        self, user_id: Optional[str] = None, request_tool_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Load tools from database for a specific user.

        Args:
            user_id: Filter tools by this user. If None, returns empty dict (fail closed).
            request_tool_name: Optional specific tool name to reload.

        Returns:
            Dict of tools in format: {tool_name: {tool_data, proxy, execution_mode}}
        """
        result: Dict[str, Any] = {}

        # Security: If no user_id provided, return empty (fail closed)
        if not user_id:
            logger.warning("No user_id provided to scan_and_load_tools, returning empty tools")
            return result

        async with AsyncSessionLocal() as session:
            repo = ToolRepository(session)

            if request_tool_name:
                tool = await repo.get_tool_by_user_and_name(user_id, request_tool_name)
                tools = [tool] if tool and tool.is_active else []
            else:
                tools = await repo.list_tools_by_user(user_id, is_active=True)

            for tool in tools:
                ready_versions = await repo.list_tool_versions_by_tool(tool.id, status=ToolStatus.READY)
                if not ready_versions:
                    continue

                # Get the latest ready version
                latest_version = max(ready_versions, key=lambda v: v.version)

                # Get functions for this version
                functions = await repo.list_tool_functions_by_version(latest_version.id)

                for tf in functions:
                    tool_data = self._build_tool_data(tf, tool.name)
                    tool_name = tool_data["name"]

                    # Use container proxy
                    requirements = self._get_requirements(latest_version)

                    proxy = ContainerToolProxy(tool_data, latest_version.code_content or "", requirements)
                    result[tool_name] = {
                        "tool_data": tool_data,
                        "proxy": proxy,
                        "execution_mode": "container",
                    }
                    logger.debug(f"Prepared DB container tool: {tool_name} for user {user_id}")

        logger.info(f"Loaded {len(result)} tools from database for user {user_id}")
        return result

    async def load_tools(self, tool_name: Optional[str] = None) -> Dict[str, Any]:
        return await self.scan_and_load_tools(tool_name)

    def register_tools_to_mcp(
        self,
        mcp: FastMCP,
        tools: Dict[str, Any],
        user_id: str,
        request_tool_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Register tools to MCP and track user ownership.

        Args:
            mcp: FastMCP instance
            tools: Dict of tools to register
            user_id: User ID who owns these tools
            request_tool_name: Optional specific tool name being registered

        Returns:
            Dict with 'added' list of tool names
        """
        existing_tools: Dict[str, FunctionTool] = mcp._tool_manager._tools  # type: ignore
        logger.debug(existing_tools)
        for tool_name, tool_info in tools.items():
            tool_data = tool_info["tool_data"]
            proxy = tool_info["proxy"]
            tool_data["fn"] = proxy.__call__
            function_tool = FunctionTool.model_validate(
                {k: v for k, v in tool_data.items() if k not in ["source_module", "function_name"]}
            )
            if tool_name in existing_tools:
                mcp.remove_tool(tool_name)
            mcp.add_tool(function_tool)

            # Track ownership
            self._tool_ownership[tool_name] = user_id

            execution_mode = tool_info.get("execution_mode", "unknown")
            logger.info(f"Registered DB {execution_mode} tool: {tool_name} for user {user_id}")
        return {"added": list(tools.keys())}

    def register_tools(self, mcp: FastMCP, tools: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        return self.register_tools_to_mcp(mcp, tools, user_id)

    async def refresh_tools(self, mcp: FastMCP, user_id: str) -> Dict[str, Any]:
        """
        Refresh database tools for a specific user only.
        Preserves built-in tools and other users' tools.

        Args:
            mcp: FastMCP instance
            user_id: User whose tools to refresh

        Returns:
            Dict with 'removed', 'added', 'updated' lists
        """
        logger.info(f"Refreshing database tools for user {user_id}...")

        # Get currently registered tools from MCP server
        existing_tools: Dict[str, FunctionTool] = mcp._tool_manager._tools  # type: ignore

        # Scan database for this user's current tools
        new_tools = await self.scan_and_load_tools(user_id=user_id)
        new_tool_names = set(new_tools.keys())

        # Identify which existing tools belong to this user using ownership registry
        current_user_tools = {name for name, owner in self._tool_ownership.items() if owner == user_id}

        # Find this user's tools to remove (in MCP but not in database)
        tools_to_remove = current_user_tools - new_tool_names

        # Find this user's tools to add (in database but not in MCP)
        tools_to_add = new_tool_names - current_user_tools

        # Find this user's tools to update (in both but may have changed)
        tools_to_update = current_user_tools & new_tool_names

        result: Dict[str, Any] = {"removed": [], "added": [], "updated": []}

        # Remove deleted tools from MCP server
        for tool_name in tools_to_remove:
            if tool_name in existing_tools:
                mcp.remove_tool(tool_name)
                # Remove from ownership tracking
                if tool_name in self._tool_ownership:
                    del self._tool_ownership[tool_name]
                result["removed"].append(tool_name)
                logger.info(f"Removed tool: {tool_name}")

        # Add new tools to MCP server
        if tools_to_add:
            tools_to_register = {name: new_tools[name] for name in tools_to_add}
            self.register_tools_to_mcp(mcp, tools_to_register, user_id)
            result["added"] = list(tools_to_add)
            logger.info(f"Added tools to MCP: {tools_to_add}")

        # Update existing tools (re-register to pick up changes)
        if tools_to_update:
            tools_to_reregister = {name: new_tools[name] for name in tools_to_update}
            self.register_tools_to_mcp(mcp, tools_to_reregister, user_id)
            result["updated"] = list(tools_to_update)
            logger.info(f"Updated tools in MCP: {tools_to_update}")

        logger.info(f"Tool refresh for user {user_id} completed: {result}")
        return result


tool_loader = DatabaseToolLoader()
