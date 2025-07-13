from typing_extensions import Any, Dict, List, Tuple
from mcp.types import Tool
import logging

logger = logging.getLogger(__name__)

def openapi2mcp(
    openapi_schema: Dict[str, Any]
) -> Tuple[set[Tool], Dict[str, Dict[str, Any]]]:
    """将OpenAPI schema转换为MCP工具和操作映射"""
    # 初始化MCP工具列表和operation_map
    mcp_tools: set[Tool] = set()
    operation_map: Dict[str, Dict[str, Any]] = {}
    
    # 获取paths信息
    paths = openapi_schema.get("paths", {})
    
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method not in ["get", "post", "put", "delete", "patch"]:
                continue
            
            operation_id = operation.get("operationId")
            if not operation_id:
                continue
            
            # 创建MCP工具
            tool = Tool(
                name=operation_id,
                description=operation.get("description", operation.get("summary", f"{method.upper()} {path}")),
                inputSchema={
                    "type": "object",
                    "properties": _extract_parameters_schema(operation),
                    "required": _extract_required_parameters(operation)
                }
            )
            
            mcp_tools.add(tool)
            
            # 创建操作映射
            operation_map[operation_id] = {
                "path": path,
                "method": method,
                "parameters": operation.get("parameters", []),
                "requestBody": operation.get("requestBody"),
                "responses": operation.get("responses", {})
            }
    
    return mcp_tools, operation_map

def _extract_parameters_schema(operation: Dict[str, Any]) -> Dict[str, Any]:
    """从操作中提取参数schema"""
    properties = {}
    parameters = operation.get("parameters", [])
    
    for param in parameters:
        param_name = param.get("name")
        if param_name:
            param_schema = param.get("schema", {})
            properties[param_name] = {
                "type": param_schema.get("type", "string"),
                "description": param.get("description", "")
            }
    
    # 处理请求体
    request_body = operation.get("requestBody")
    if request_body:
        content = request_body.get("content", {})
        for content_type, content_schema in content.items():
            if content_type == "application/json":
                schema = content_schema.get("schema", {})
                if schema.get("type") == "object":
                    properties.update(schema.get("properties", {}))
    
    return properties

def _extract_required_parameters(operation: Dict[str, Any]) -> List[str]:
    """从操作中提取必需参数"""
    required = []
    parameters = operation.get("parameters", [])
    
    for param in parameters:
        if param.get("required", False):
            param_name = param.get("name")
            if param_name:
                required.append(param_name)
    
    return required