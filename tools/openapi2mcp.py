from typing_extensions import Any, Dict, List, Tuple
from mcp.types import Tool





mcp_tools: List[Tool] = []
operation_map: Dict[str, Dict[str, Any]] = {}


def openapi2mcp(
    openapi_schema: Dict[str, Any]
    ) -> Tuple[List[Tool], Dict[str, Dict[str, Any]]]:
    return mcp_tools, operation_map