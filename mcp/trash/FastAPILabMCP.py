# Python官方库导入
from typing_extensions import Annotated, Any, Dict, Doc, List, Literal, Optional
from logging import getLogger

# FastAPI导入
from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI, APIRouter

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from tools import FastAPILabMCPSseServerTransport, FastAPILabMCPHttpServerTransport, openapi2mcp, get_all_lids
from servers import MCPServer
from models import Lab
from routers import labs_router

logger = getLogger(__name__)

class LabMCPManager:# 管理多个实验室的MCP服务器类
    def __init__(self):
        self.lab_mcp_servers: Dict[int, 'FastAPILabMCP'] = {}# Lab ID与实验室MCP服务器实例的映射
        self.lab_transports: Dict[int, FastAPILabMCPSseServerTransport] = {}# Lab ID与实验室MCP服务器传输实例的映射

    def get_or_create_lab_mcp(self, lid: int, fastapi: FastAPI) -> 'FastAPILabMCP':# 获取或创建指定实验室的MCP服务器 TODO 需要完善处理FastAPILabMCP中的tags&operation_ids筛选与lids筛选之间的关系
        if lid not in self.lab_mcp_servers:
            try:
                lab = Lab.from_lid(lid)
                # 根据实验室可用工具创建operation_ids过滤列表
                available_tool_ids = [tool.tid for tool in lab.mcp_tools_available if tool.tid is not None]

                self.lab_mcp_servers[lid] = FastAPILabMCP(
                    fastapi=fastapi,
                    name=f"{lab.name} MCP Server",
                    description=f"MCP服务器 for {lab.name}",
                    lab_id=lid,
                    available_tool_ids=available_tool_ids
                )
            except Exception as e:
                raise ValueError(f"创建实验室{lid}的MCP服务器失败: {str(e)}")
        
        return self.lab_mcp_servers[lid]
    
    def get_lab_transport(self, lid: int) -> Optional[FastAPILabMCPSseServerTransport]:# 获取指定实验室的传输实例
        return self.lab_transports.get(lid)

    def set_lab_transport(self, lid: int, transport: FastAPILabMCPSseServerTransport):# 设置指定实验室的传输实例
        self.lab_transports[lid] = transport

lab_mcp_manager = LabMCPManager()# 全局实验室MCP管理器

class FastAPILabMCP:# 实验室MCP服务器类
    def __init__(# 初始化实验室MCP服务器
        self,
        # FastAPILabMCP基础参数
        fastapi: Annotated[FastAPI, Doc("利用挂载FastAPI创建实验室个性化的MCP服务器")],
        name: Annotated[
            Optional[str], Doc("实验室的MCP服务器名称(默认继承FastAPI的名称)")
        ] = None,
        description: Annotated[
            Optional[str], Doc("实验室的MCP服务器描述（默认继承FastAPI的描述）")
        ] = None,
        # FastAPILabMCP实验室参数
        lab_id: Annotated[
            Optional[int], Doc("实验室ID，用于过滤工具")
        ] = None,
        available_tool_ids: Annotated[
            Optional[List[int]], Doc("实验室可用工具的ID列表")
        ] = None,
        # FastAPILabMCP工具筛选参数
        operations_include: Annotated[
            Optional[List[str]],
            Doc(
                "通过operation_id指定MCP工具（默认包含所有API转化而来的MCP工具，不与operations_exclude同时使用）"
            ),
        ] = None,
        operations_exclude: Annotated[
            Optional[List[str]],
            Doc(
                "通过operation_id排除MCP工具（默认包含所有API转化而来的MCP工具，不与operations_include同时使用）"
            ),
        ] = None,
        tags_include: Annotated[
            Optional[List[str]],
            Doc(
                "通过tag指定MCP工具(默认包含所有API转化而来的MCP工具，不与tags_exclude同时使用)"
            ),
        ] = None,
        tags_exclude: Annotated[
            Optional[List[str]],
            Doc(
                "通过tag排除MCP工具（默认包含所有API转化而来的MCP工具，不与tags_include同时使用）"
            ),
        ] = None,
    ):
        # 工具筛选方法验证
        if operations_include and operations_exclude:  # 不能同时使用
            raise ValueError("operations_include和operations_exclude不能同时使用")
        if tags_include and tags_exclude:  # 不能同时使用
            raise ValueError("tags_include和tags_exclude不能同时使用")
        
        # 实验室相关参数
        self.lab_id = lab_id
        self.available_tool_ids = available_tool_ids or []
        
        # 工具参数初始化
        self._operations_include = operations_include
        self._operations_exclude = operations_exclude
        self._tags_include = tags_include
        self._tags_exclude = tags_exclude

        # MCP服务器参数初始化
        self.operation_map: Dict[str, Dict[str, Any]]
        self.tools: set[Tool]  # MCP工具列表（已筛选了operations或者tags）
        self.server: MCPServer  # MCP服务器实例

        # 基础参数初始化
        self.fastapi = fastapi
        self.name = name or fastapi.title or "FastAPI LabMCP"
        self.description = (
            description
            or fastapi.description
            or "This is a FastAPI mounted LabMCP server."
        )
        """
        # HTTP客户端
        self._base_url = "http://apiserver"
        self._http_client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.fastapi, raise_app_exceptions=False),
            base_url=self._base_url,
            timeout=10.0,
        )
        """
        # 初始化LabMCP服务器
        self.setup_lab_mcp_server()

    # API2MCP工具生成方法
    def _get_openapi_schema(self) -> Dict[str, Any]:  # 获取FastAPI的OpenAPI模式
        return get_openapi(
            title=self.fastapi.title,
            version=self.fastapi.version,
            openapi_version=self.fastapi.openapi_version,
            description=self.fastapi.description,
            routes=self.fastapi.routes,
        )

    def _has_filters(self) -> bool:  # 检查是否有任何筛选条件
        return (
            self._operations_include is not None
            or self._operations_exclude is not None
            or self._tags_include is not None
            or self._tags_exclude is not None
        )

    def _build_operations_by_tag(self) -> Dict[str, List[str]]:  # 构建tag到operation_id的映射关系
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

    def _filter_tools(self, mcp_tools: set[Tool]) -> set[Tool]:  # 根据操作ID和标签过滤工具列表
        if not self._has_filters():
            return mcp_tools
        operations_by_tag = self._build_operations_by_tag()
        all_operations = {tool.name for tool in mcp_tools}
        operations_to_include = set()
        # 按优先级处理包含和排除逻辑
        if self._operations_include is not None:
            operations_to_include.update(self._operations_include)
        elif self._operations_exclude is not None:
            operations_to_include.update(all_operations - set(self._operations_exclude))

        if self._tags_include is not None:
            for tag in self._tags_include:
                operations_to_include.update(operations_by_tag.get(tag, []))
        elif self._tags_exclude is not None:
            excluded_operations = set()
            for tag in self._tags_exclude:
                excluded_operations.update(operations_by_tag.get(tag, []))
            operations_to_include.update(all_operations - excluded_operations)
        # 过滤工具
        filtered_tools = set()
        for tool in mcp_tools:
            if tool.name in operations_to_include:
                filtered_tools.add(tool)
        # 更新operation_map
        if filtered_tools:
            filtered_operation_ids = {tool.name for tool in filtered_tools}
            self.operation_map = {
                op_id: details
                for op_id, details in self.operation_map.items()
                if op_id in filtered_operation_ids
            }
        return filtered_tools

    def _api2mcp_tools(self) -> set[Tool]:  # 自定义地将FastAPI的API转化为MCP工具
        mcp_tools, self.operation_map = openapi2mcp(openapi_schema=self._get_openapi_schema())
        
        # 过滤工具
        filtered_tools = self._filter_tools(mcp_tools)

        return filtered_tools

    def setup_lab_mcp_server(self) -> None:  # 初始化LabMCP服务器
        # 初始化工具列表
        self.tools = self._api2mcp_tools()
        
        # 创建MCP服务器实例
        lab_mcp_server: MCPServer = MCPServer(self.name, self.description)

        """# 注册MCP工具列表端点
        @lab_mcp_server.list_tools()
        async def handle_list_tools() -> List[types.Tool]:
            return self.tools

        @lab_mcp_server.call_tool()
        async def handle_call_tool(
            name: str, arguments: Dict[str, Any], http_request_info: Optional[HTTPRequestInfo] = None
        ) -> List[Union[types.TextContent, types.ImageContent, types.EmbeddedResource]]:
            return await self._execute_api_tool(
                client=self._http_client,
                tool_name=name,
                arguments=arguments,
                operation_map=self.operation_map,
                http_request_info=http_request_info,
            )
        """

        self.server = lab_mcp_server

    """# 执行API工具
    async def _execute_api_tool(
        self,
        client: httpx.AsyncClient,
        tool_name: str,
        arguments: Dict[str, Any],
        operation_map: Dict[str, Dict[str, Any]],
        http_request_info: Optional[HTTPRequestInfo] = None,
    ) -> List[Union[types.TextContent, types.ImageContent, types.EmbeddedResource]]:
        if tool_name not in operation_map:
            raise Exception(f"Unknown tool: {tool_name}")

        operation = operation_map[tool_name]
        path: str = operation["path"]
        method: str = operation["method"]
        parameters: List[Dict[str, Any]] = operation.get("parameters", [])
        arguments = arguments.copy() if arguments else {}

        # 处理路径参数
        for param in parameters:
            if param.get("in") == "path" and param.get("name") in arguments:
                param_name = param.get("name")
                if param_name:
                    path = path.replace(f"{{{param_name}}}", str(arguments.pop(param_name)))

        # 处理查询参数
        query = {}
        for param in parameters:
            if param.get("in") == "query" and param.get("name") in arguments:
                param_name = param.get("name")
                if param_name:
                    query[param_name] = arguments.pop(param_name)

        # 处理头部参数
        headers = {}
        for param in parameters:
            if param.get("in") == "header" and param.get("name") in arguments:
                param_name = param.get("name")
                if param_name:
                    headers[param_name] = arguments.pop(param_name)

        # 处理身份验证
        if http_request_info and http_request_info.headers:
            if "Authorization" in http_request_info.headers:
                headers["Authorization"] = http_request_info.headers["Authorization"]

        body = arguments if arguments else None

        try:
            logger.debug(f"Making {method.upper()} request to {path}")
            response = await self._request(client, method, path, query, headers, body)
            
            try:
                result = response.json()
                result_text = json.dumps(result, indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                result_text = response.text if hasattr(response, 'text') else str(response.content)

            if 400 <= response.status_code < 600:
                raise Exception(f"Error calling {tool_name}. Status code: {response.status_code}. Response: {result_text}")

            return [types.TextContent(type="text", text=result_text)]

        except Exception as e:
            logger.exception(f"Error calling {tool_name}")
            raise e

    async def _request(
        self,
        client: httpx.AsyncClient,
        method: str,
        path: str,
        query: Dict[str, Any],
        headers: Dict[str, str],
        body: Optional[Any],
    ) -> Any:
        method_lower = method.lower()
        if method_lower == "get":
            return await client.get(path, params=query, headers=headers)
        elif method_lower == "post":
            return await client.post(path, params=query, headers=headers, json=body)
        elif method_lower == "put":
            return await client.put(path, params=query, headers=headers, json=body)
        elif method_lower == "delete":
            return await client.delete(path, params=query, headers=headers)
        elif method_lower == "patch":
            return await client.patch(path, params=query, headers=headers, json=body)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

    def _register_mcp_connection_endpoint_sse(
        self,
        router: FastAPI | APIRouter,
        transport: FastApiSseTransport,
        mount_path: str,
        dependencies: Optional[Sequence[params.Depends]],
    ):
        @router.get(mount_path, include_in_schema=False, operation_id=f"mcp_connection_{self.lab_id}", dependencies=dependencies)
        async def handle_mcp_connection(request: Request):
            async with transport.connect_sse(request.scope, request.receive, request._send) as (reader, writer):
                await self.server.run(
                    reader,
                    writer,
                    self.server.create_initialization_options(notification_options=None, experimental_capabilities={}),
                    raise_exceptions=False,
                )

    def _register_mcp_messages_endpoint_sse(
        self,
        router: FastAPI | APIRouter,
        transport: FastApiSseTransport,
        mount_path: str,
        dependencies: Optional[Sequence[params.Depends]],
    ):
        @router.post(
            f"{mount_path}/messages/",
            include_in_schema=False,
            operation_id=f"mcp_messages_{self.lab_id}",
            dependencies=dependencies,
        )
        async def handle_post_message(request: Request):
            return await transport.handle_fastapi_post_message(request)

    def _register_mcp_endpoints_sse(
        self,
        router: FastAPI | APIRouter,
        transport: FastApiSseTransport,
        mount_path: str,
        dependencies: Optional[Sequence[params.Depends]],
    ):
        self._register_mcp_connection_endpoint_sse(router, transport, mount_path, dependencies)
        self._register_mcp_messages_endpoint_sse(router, transport, mount_path, dependencies)
    """
    def mount(# 挂载MCP服务器到指定路径
        self,
        router: Annotated[
            Optional[FastAPI | APIRouter],
            Doc("挂载MCP服务器到FastAPI或APIRouter,默认挂载到FastAPI"),
        ] = None,
        mount_path: Annotated[str, Doc("挂载路径,默认挂载到/mcp")] = "/mcp",
        transport: Annotated[
            Literal["sse", "http"],
            Doc("MCP服务器的传输类型,默认使用sse"),
        ] = "sse",
    ) -> None:
        """挂载MCP服务器到指定路径"""
        # 规范化挂载路径的格式
        if not mount_path.startswith("/"):
            mount_path = f"/{mount_path}"
        if mount_path.endswith("/"):
            mount_path = mount_path[:-1]
        
        # 获取挂载的router
        if not router:
            router = self.fastapi

        # 构建基础路径
        if isinstance(router, FastAPI):
            base_path = router.root_path
        elif isinstance(router, APIRouter):
            base_path = self.fastapi.root_path + router.prefix
        else:
            raise ValueError(f"Invalid router type: {type(router)}")

        messages_path = f"{base_path}{mount_path}/messages/"
        
        # 注册端点
        if transport == "sse":
            # 创建SSE传输
            sse_transport = FastAPILabMCPSseServerTransport(messages_path)
            #self._register_mcp_endpoints_sse(router, sse_transport, mount_path, None)
            #TODO 实现SSE传输
            pass
        elif transport == "http":
            # 创建HTTP传输
            #http_transport = FastAPILabMCPHttpServerTransport(messages_path)
            #self._register_mcp_endpoints_http(router, http_transport, mount_path, None)
            #TODO 实现HTTP传输
            pass
        else:
            raise ValueError(f"Invalid transport: {transport}")

        # 如果是APIRouter，需要重新包含到FastAPI应用中
        """# logger和重新包含有待考察再去具体实现
        if isinstance(router, APIRouter):
            self.fastapi.include_router(router)
        
        logger.info(f"Lab {self.lab_id} MCP server mounted at {mount_path}")
        """

def mount_lab_mcp_dynamically(fastapi: FastAPI):# 动态挂载所有实验室的MCP服务器
    try:
        # 获取所有实验室ID
        lids = get_all_lids()

        for lid in lids:
            try:
                # 创建或获取实验室MCP服务器
                lab_mcp = lab_mcp_manager.get_or_create_lab_mcp(lid, fastapi)
                
                # 挂载到动态路径
                mount_path = f"/labs/{lid}/tools/mcp"
                lab_mcp.mount(router=labs_router, mount_path=mount_path)
                
                logger.info(f"Successfully mounted MCP server for lab {lid} at {mount_path}")
                
            except Exception as e:
                logger.error(f"Failed to mount MCP server for lab {lid}: {str(e)}")
                continue
                
    except Exception as e:
        logger.error(f"Failed to mount lab MCP servers: {str(e)}")
        
