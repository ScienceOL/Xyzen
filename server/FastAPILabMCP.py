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
        self.tools: List[Tool]# MCP工具列表（已筛选了operations或者tags）
        self.server: Server # MCP服务器实例
        
        # 基础参数初始化
        self.fastapi = fastapi
        self.name = name or fastapi.title or "FastAPI LabMCP"
        self.description = description or fastapi.description or "This is a FastAPI mounted LabMCP server."
        
        # 初始化LabMCP服务器
        self.setup_lab_mcp_server()
    
    # API2MCP工具生成方法
    def _get_operation_ids(
        self,
        mcp_tools: List[Tool]
    ) -> List[Tool]:# 处理operation_id筛选
        operation_id_filtered_mcp_tools = []
        return operation_id_filtered_mcp_tools
    def _get_tags(# 处理tag筛选
        self,
        mcp_tools: List[Tool]
    ) -> List[Tool]:
        tags_filtered_mcp_tools = []
        return tags_filtered_mcp_tools
    def _get_tools(
        self,
        mcp_tools: List[Tool]
    ) -> List[Tool]:
        filtered_mcp_tools = []
        if (
            self._operations_include is None
            and self._operations_exclude is None
        ):# 如果未指定operation_id筛选条件，则使用tag筛选
            filtered_mcp_tools = self._get_tags(mcp_tools)
        elif (
            self._tags_include is None
            and self._tags_exclude is None
        ):# 如果未指定tag筛选条件，则使用operation_id筛选
            filtered_mcp_tools = self._get_operation_ids(mcp_tools)
        else:
            pass #TODO:实现tags和operation_id的联合筛选
        return filtered_mcp_tools
    def api2mcp_tools(self) -> List[Tool]:# 自定义地将FastAPI的API转化为MCP工具
        # 获取FastAPI的OpenAPI模式
        openapi_schema = get_openapi(
            title=self.fastapi.title,
            version=self.fastapi.version,
            openapi_version=self.fastapi.openapi_version,
            description=self.fastapi.description,
            routes=self.fastapi.routes
        )
        # 将OpenAPI模式转化为MCP工具
        mcp_tools, self.operation_map = openapi2mcp(
            openapi_schema=openapi_schema
        )
        if (
            self._operations_include is None
            and self._operations_exclude is None
            and self._tags_include is None
            and self._tags_exclude is None
        ):
            return mcp_tools# 如果未指定筛选条件，则返回所有API转化而来的MCP工具
        else:
            return self._get_tools(mcp_tools)# 如果指定了筛选条件，则返回经过筛选后的MCP工具列表

    # LabMCP服务器初始化方法
    def setup_lab_mcp_server(self):
        # 初始化工具列表
        self.tools = self.api2mcp_tools()
