import json
import logging
from typing import Any, Dict, Optional

from fastmcp import FastMCP
from fastmcp.tools import FunctionTool
from sqlmodel import Session, select

from middleware.database.connection import engine
from models import Tool, ToolFunction, ToolStatus, ToolVersion
from utils.parser import parse_requirements
from utils.tool_proxy import ContainerToolProxy, ToolProxyManager

logger = logging.getLogger(__name__)


class DatabaseToolLoader:
    def __init__(self) -> None:
        logger.info("Initializing DatabaseToolLoader")
        self.proxy_manager = ToolProxyManager()

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

    def scan_and_load_tools(self, request_tool_name: Optional[str] = None) -> Dict[str, Any]:
        """Load tools from database, and return tool dict like DynamicToolLoader."""
        result: Dict[str, Any] = {}
        with Session(engine) as session:
            # Query active tools
            tools = session.exec(select(Tool).where(Tool.is_active)).all()
            for tool in tools:
                ready_versions = [v for v in (tool.versions or []) if v.status == ToolStatus.READY]
                if not ready_versions:
                    continue
                latest_version = max(ready_versions, key=lambda v: v.version)

                for tf in latest_version.functions or []:
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
                    logger.debug(f"Prepared DB container tool: {tool_name}")

        logger.info(f"Loaded {len(result)} tools from database")
        return result

    async def load_tools(self, tool_name: Optional[str] = None) -> Dict[str, Any]:
        return self.scan_and_load_tools(tool_name)

    def register_tools_to_mcp(
        self,
        mcp: FastMCP,
        tools: Dict[str, Any],
        request_tool_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        existing_tools: Dict[str, FunctionTool] = mcp._tool_manager._tools  # type: ignore
        logger.info(existing_tools)
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

            execution_mode = tool_info.get("execution_mode", "unknown")
            logger.info(f"Registered DB {execution_mode} tool: {tool_name}")
        return {"added": list(tools.keys())}

    def register_tools(self, mcp: FastMCP, tools: Dict[str, Any]) -> Dict[str, Any]:
        return self.register_tools_to_mcp(mcp, tools)

    def refresh_tools(self, mcp: FastMCP) -> Dict[str, Any]:
        """Refresh database tools only, preserving built-in tools."""
        logger.info("Refreshing database tools...")

        # Get currently registered tools from MCP server
        existing_tools: Dict[str, FunctionTool] = mcp._tool_manager._tools  # type: ignore
        current_tool_names = set(existing_tools.keys())

        # Scan database for current tools
        new_tools = self.scan_and_load_tools()
        new_tool_names = set(new_tools.keys())

        # Identify database tools (those with "-" in the name, following our naming convention)
        # Built-in tools don't have "-" in their names
        current_db_tools = {name for name in current_tool_names if "-" in name}
        new_db_tools = new_tool_names  # All tools from database have "-" in name

        # Find database tools to remove (in MCP but not in database)
        tools_to_remove = current_db_tools - new_db_tools

        # Find database tools to add (in database but not in MCP)
        tools_to_add = new_db_tools - current_db_tools

        # Find database tools to update (in both but may have changed)
        tools_to_update = current_db_tools & new_db_tools

        result: Dict[str, Any] = {"removed": [], "added": [], "updated": []}

        # Remove deleted database tools from MCP server
        for tool_name in tools_to_remove:
            if tool_name in existing_tools:
                mcp.remove_tool(tool_name)
                result["removed"].append(tool_name)
                logger.info(f"Removed database tool from MCP: {tool_name}")

        # Add new database tools to MCP server
        if tools_to_add:
            tools_to_register = {name: new_tools[name] for name in tools_to_add}
            self.register_tools_to_mcp(mcp, tools_to_register)
            result["added"] = list(tools_to_add)
            logger.info(f"Added database tools to MCP: {tools_to_add}")

        # Update existing database tools (remove and re-add to ensure changes are picked up)
        if tools_to_update:
            tools_to_reregister = {name: new_tools[name] for name in tools_to_update}
            self.register_tools_to_mcp(mcp, tools_to_reregister)
            result["updated"] = list(tools_to_update)
            logger.info(f"Updated database tools in MCP: {tools_to_update}")

        logger.info(f"Database tool refresh completed: {result}")
        return result


tool_loader = DatabaseToolLoader()
