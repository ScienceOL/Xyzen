import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP
from fastmcp.tools import FunctionTool
from sqlmodel import Session, select

from middleware.database.connection import engine
from models import Tool, ToolFunction, ToolStatus, ToolVersion
from utils.logger_config import dynamic_logger
from utils.requirements_parser import parse_requirements
from utils.tool_proxy import ContainerToolProxy, ToolProxyManager

logger = dynamic_logger.get_logger("tool-provider")


class ToolChangeManager:
    """Manage tool change detection and recording"""

    def __init__(self) -> None:
        self.previous_tools: Dict[str, Dict[str, Any]] = {}
        self.current_tools: Dict[str, Dict[str, Any]] = {}
        self.change_history: List[Dict[str, Any]] = []
        self.file_hashes: Dict[str, str] = {}

    def get_file_hash(self, filepath: str) -> str:
        """Get MD5 hash of a file"""
        try:
            with open(filepath, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""

    def update_tools(
        self,
        existing_tools_desc: Dict[str, Dict[str, Any]],
        new_tools_desc: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Update tool list and detect changes"""
        self.previous_tools = existing_tools_desc.copy()
        self.current_tools = new_tools_desc.copy()

        # Detect changes
        changes = self.detect_changes()
        if changes and (len(changes["added"]) or len(changes["modified"]) or len(changes["removed"])):
            change_record = {
                "timestamp": datetime.now().isoformat(),
                "changes": changes,
            }
            self.change_history.append(change_record)

        return changes

    def detect_changes(self) -> Dict[str, Any]:
        """Detect tool changes with detailed value comparison"""
        changes: Dict[str, Any] = {"added": [], "removed": [], "modified": []}

        # Detect newly added tools
        for tool_name in self.current_tools:
            if tool_name not in self.previous_tools:
                changes["added"].append({"name": tool_name, "details": self.current_tools[tool_name]})

        # Detect removed tools
        for tool_name in self.previous_tools:
            if tool_name not in self.current_tools:
                changes["removed"].append({"name": tool_name, "details": self.previous_tools[tool_name]})

        # Detect modified tools
        for tool_name in self.current_tools:
            if tool_name in self.previous_tools:
                if self.current_tools[tool_name] != self.previous_tools[tool_name]:
                    # Detailed difference comparison
                    diff_details = self._get_detailed_diff(
                        self.previous_tools[tool_name], self.current_tools[tool_name]
                    )
                    changes["modified"].append(
                        {
                            "name": tool_name,
                            "previous": self.previous_tools[tool_name],
                            "current": self.current_tools[tool_name],
                            "differences": diff_details,
                        }
                    )

        return changes

    def _get_detailed_diff(self, old_desc: Dict[str, Any], new_desc: Dict[str, Any]) -> Dict[str, Any]:
        """Get detailed differences between two tool descriptions"""
        differences: Dict[str, Any] = {}

        # Check all key changes
        all_keys = set(old_desc.keys()) | set(new_desc.keys())

        for key in all_keys:
            old_value = old_desc.get(key)
            new_value = new_desc.get(key)

            if old_value != new_value:
                differences[key] = {"old": old_value, "new": new_value}

        return differences

    def get_change_summary(self) -> Dict[str, Any]:
        """Get change summary"""
        return {
            "current_tools_count": len(self.current_tools),
            "previous_tools_count": len(self.previous_tools),
            "recent_changes": self.change_history[-2:] if self.change_history else [],
            "tool_details": {
                "current": list(self.current_tools.keys()),
                "previous": list(self.previous_tools.keys()),
            },
        }


# Global change manager
change_manager = ToolChangeManager()


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
                tool_data["returns"] = json.loads(tf.output_schema)
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


def get_tool_loader() -> DatabaseToolLoader:
    return DatabaseToolLoader()


tool_loader = get_tool_loader()
