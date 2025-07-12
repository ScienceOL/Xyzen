from typing_extensions import Annotated, Doc, List, Optional
from fastapi import FastAPI







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
        # 工具筛选
        self._operations_include = operations_include
        self._operations_exclude = operations_exclude
        self._tags_include = tags_include
        self._tags_exclude = tags_exclude