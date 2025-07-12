from typing_extensions import Annotated, Any, Dict, Doc, List, Optional
from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI
from mcp.types import Tool
from mcp.server.lowlevel.server import Server
from tools import openapi2mcp




class FastAPILabMCP:
    def __init__(
        self,
        # FastAPILabMCP基础参数
        fastapi: Annotated[
            FastAPI,
            Doc("利用挂载FastAPI创建实验室个性化的MCP服务器")
        ],
        name: Annotated[
            Optional[str],
            Doc("实验室的MCP服务器名称(默认继承FastAPI的名称)")
        ] = None,
        description: Annotated[
            Optional[str],
            Doc("实验室的MCP服务器描述（默认继承FastAPI的描述）")
        ] = None,
        # FastAPILabMCP工具参数
        operations_include: Annotated[
            Optional[List[str]],
            Doc("通过operation_id指定MCP工具（默认包含所有API转化而来的MCP工具，不与operations_exclude同时使用）")
        ] = None,
        operations_exclude: Annotated[
            Optional[List[str]],
            Doc("通过operation_id排除MCP工具（默认包含所有API转化而来的MCP工具，不与operations_include同时使用）")
        ] = None,
        tags_include: Annotated[
            Optional[List[str]],
            Doc("通过tag指定MCP工具(默认包含所有API转化而来的MCP工具，不与tags_exclude同时使用)")
        ] = None,
        tags_exclude: Annotated[
            Optional[List[str]],
            Doc("通过tag排除MCP工具（默认包含所有API转化而来的MCP工具，不与tags_include同时使用）")
        ] = None
    ):
        # 工具筛选方法验证
        if operations_include and operations_exclude:# 不能同时使用
            raise ValueError("operations_include和operations_exclude不能同时使用")
        if tags_include and tags_exclude:# 不能同时使用
            raise ValueError("tags_include和tags_exclude不能同时使用")
        # 工具参数初始化
        self._operations_include = operations_include
        self._operations_exclude = operations_exclude
        self._tags_include = tags_include
        self._tags_exclude = tags_exclude
        
        # MCP服务器参数初始化
        self.operation_map: Dict[str, Dict[str, Any]]
        self.tools: set[Tool]# MCP工具列表（已筛选了operations或者tags）
        self.server: Server # MCP服务器实例
        
        # 基础参数初始化
        self.fastapi = fastapi
        self.name = name or fastapi.title or "FastAPI LabMCP"
        self.description = description or fastapi.description or "This is a FastAPI mounted LabMCP server."
        

        
        # 初始化LabMCP服务器
        self.setup_lab_mcp_server()
    
    # API2MCP工具生成方法
    def _get_openapi_schema(self) -> Dict[str, Any]:
        """获取FastAPI的OpenAPI模式"""
        return get_openapi(
            title=self.fastapi.title,
            version=self.fastapi.version,
            openapi_version=self.fastapi.openapi_version,
            description=self.fastapi.description,
            routes=self.fastapi.routes
        )
    
    def _has_filters(self) -> bool:
        """检查是否有任何筛选条件"""
        return (
            self._operations_include is not None
            or self._operations_exclude is not None
            or self._tags_include is not None
            or self._tags_exclude is not None
        )
    
    def _build_operations_by_tag(self) -> Dict[str, List[str]]:
        """构建tag到operation_id的映射关系"""
        openapi_schema = self._get_openapi_schema()
        operations_by_tag: Dict[str, List[str]] = {}
        
        for path, path_item in openapi_schema.get("paths", {}).items():
            for method, operation in path_item.items():
                if method not in ["get", "post", "put", "delete", "patch"]:
                    continue
                
                operation_id = operation.get("operationId")
                if not operation_id:
                    continue
                
                for tag in operation.get("tags", []):
                    if tag not in operations_by_tag:
                        operations_by_tag[tag] = []
                    operations_by_tag[tag].append(operation_id)
        
        return operations_by_tag
    
    def _filter_tools(self, mcp_tools: set[Tool]) -> set[Tool]:
        """根据操作ID和标签过滤工具列表"""
        if not self._has_filters():
            return mcp_tools

        operations_by_tag = self._build_operations_by_tag()
        all_operations = {tool.name for tool in mcp_tools}
        
        # 收集包含和排除的操作
        include_ops = set()
        exclude_ops = set()
        
        if self._operations_include:
            include_ops.update(self._operations_include)
        if self._operations_exclude:
            exclude_ops.update(self._operations_exclude)
        if self._tags_include:
            for tag in self._tags_include:
                include_ops.update(operations_by_tag.get(tag, []))
        if self._tags_exclude:
            for tag in self._tags_exclude:
                exclude_ops.update(operations_by_tag.get(tag, []))
        
        # 确定最终包含的操作
        if exclude_ops:
            include_ops = include_ops - exclude_ops
        elif not include_ops and (self._operations_exclude or self._tags_exclude):
            include_ops = all_operations - exclude_ops

        # 过滤工具
        filtered_tools = set()
        for tool in mcp_tools:
            if tool.name in include_ops:
                filtered_tools.add(tool)
        return filtered_tools
    

    def api2mcp_tools(self) -> set[Tool]:# 自定义地将FastAPI的API转化为MCP工具
        mcp_tools, self.operation_map = openapi2mcp(openapi_schema=self._get_openapi_schema())
        
        if not self._has_filters():
            return mcp_tools
        
        filtered_tools = self._filter_tools(mcp_tools)
        
        # 更新operation_map
        if filtered_tools:
            filtered_ids = {tool.name for tool in filtered_tools}
            self.operation_map = {op_id: details for op_id, details in self.operation_map.items() if op_id in filtered_ids}
        
        return filtered_tools

    # LabMCP服务器初始化方法
    def setup_lab_mcp_server(self):
        # 初始化工具列表
        self.tools = self.api2mcp_tools()
