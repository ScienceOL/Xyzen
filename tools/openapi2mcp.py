from typing_extensions import Any, Dict, List, Tuple
from mcp.types import Tool


def openapi2mcp(
    openapi_schema: Dict[str, Any]
    ) -> Tuple[set[Tool], Dict[str, Dict[str, Any]]]:
    # 初始化MCP工具列表和operation_map
    mcp_tools: set[Tool] = set()
    operation_map: Dict[str, Dict[str, Any]] = {}
    
    return mcp_tools, operation_map