"""
MCP 服务器集合 - 自动发现和注册系统
"""

import importlib
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi.responses import JSONResponse
from fastmcp import FastMCP
from fastmcp.server.auth import TokenVerifier
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

logger = logging.getLogger(__name__)


class MCPServerRegistry:
    """MCP 服务器注册表，支持自动发现和注册"""

    def __init__(self) -> None:
        self.servers: Dict[str, Dict[str, Any]] = {}
        self._discover_servers()

    def _discover_servers(self) -> None:
        """自动发现当前目录下的所有 MCP 服务器"""
        current_dir = Path(__file__).parent
        python_files = [f for f in current_dir.glob("*.py") if f.name != "__init__.py"]

        for file_path in python_files:
            module_name = file_path.stem
            self._try_import_server(module_name)

    def _try_import_server(self, module_name: str) -> None:
        """安全地尝试导入服务器模块"""
        try:
            # 动态导入模块
            module = importlib.import_module(f".{module_name}", package=__package__)

            # 查找 FastMCP 实例
            mcp_server, auth_handler = self._extract_mcp_components(module, module_name)

            if mcp_server:
                # 生成默认配置
                server_config = self._generate_server_config(module_name, mcp_server, auth_handler)
                self.servers[module_name] = server_config

                logger.info(f"Successfully registered MCP server: {module_name}")
            else:
                logger.debug(f"No FastMCP instance found in module: {module_name}")

        except Exception as e:
            logger.warning(f"Failed to import MCP server from {module_name}: {e}")
            # 不抛出异常，确保服务启动不受影响

    def _extract_mcp_components(
        self, module: Any, module_name: str
    ) -> Tuple[Optional[FastMCP], Optional[TokenVerifier]]:
        """从模块中提取 FastMCP 实例和认证处理器"""
        mcp_server = None
        auth_handler = None

        # 查找 FastMCP 实例
        for attr_name in dir(module):
            attr_value = getattr(module, attr_name)

            # 查找 FastMCP 实例
            if isinstance(attr_value, FastMCP):
                mcp_server = attr_value
                logger.debug(f"Found FastMCP instance: {attr_name} in {module_name}")

            # 查找认证处理器
            elif isinstance(attr_value, TokenVerifier):
                auth_handler = attr_value
                logger.debug(f"Found auth handler: {attr_name} in {module_name}")

        return mcp_server, auth_handler

    def _generate_server_config(
        self, module_name: str, server: FastMCP, auth: Optional[TokenVerifier] = None
    ) -> Dict[str, Any]:
        """为服务器生成配置"""
        return {
            "server": server,
            "auth": auth,
            "mount_path": f"/xyzen/mcp/{module_name}",
            "name": (server.name if hasattr(server, "name") and server.name else f"{module_name.title()} MCP Server"),
            "module_name": module_name,
            "is_default": module_name == "dynamic_mcp_server",
        }

    def get_server(self, name: str) -> Optional[Dict[str, Any]]:
        """获取指定名称的服务器配置"""
        return self.servers.get(name)

    def get_all_servers(self) -> Dict[str, Dict[str, Any]]:
        """获取所有服务器配置"""
        return self.servers.copy()

    def list_server_names(self) -> List[str]:
        """获取所有服务器名称列表"""
        return list(self.servers.keys())

    def register_server(
        self,
        name: str,
        server: FastMCP,
        mount_path: Optional[str] = None,
        auth: Optional[TokenVerifier] = None,
        display_name: Optional[str] = None,
    ) -> None:
        """手动注册服务器"""
        config = {
            "server": server,
            "auth": auth,
            "mount_path": mount_path or f"/mcp/{name}",
            "name": display_name or f"{name.title()} MCP Server",
            "module_name": name,
        }
        self.servers[name] = config
        logger.info(f"Manually registered MCP server: {name}")


def create_mcp_handler(server_name: str, app_state: Any) -> Callable[[Scope, Receive, Send], Any]:
    """动态创建 MCP 处理器"""

    async def handler(scope: Scope, receive: Receive, send: Send) -> None:
        mcp_app = getattr(app_state, f"{server_name}_app", None)
        if mcp_app:
            await mcp_app(scope, receive, send)
        else:
            # 如果应用不存在，返回 404
            response = JSONResponse(status_code=404, content={"error": f"MCP server '{server_name}' not found"})
            await response(scope, receive, send)

    return handler


def setup_mcp_routes(app_state: Any) -> List[Mount]:
    """设置所有 MCP 路由"""
    routes = []
    for server_name, server_config in registry.get_all_servers().items():
        mount_path = server_config["mount_path"]
        handler = create_mcp_handler(server_name, app_state)
        routes.append(Mount(mount_path, handler))

    return routes


# 创建全局注册表实例
registry = MCPServerRegistry()

# 兼容性：导出传统的变量名
MCP_SERVERS = registry.get_all_servers()

# 导出注册表和服务器
__all__ = ["registry", "MCP_SERVERS", "setup_mcp_routes"]

# 动态导出所有发现的服务器实例
for server_name, server_config in registry.get_all_servers().items():
    try:
        # 重新导入模块以获取原始实例
        module = importlib.import_module(f".{server_name}", package=__package__)

        # 查找并导出 FastMCP 实例
        for attr_name in dir(module):
            attr_value = getattr(module, attr_name)
            if isinstance(attr_value, FastMCP):
                globals()[attr_name] = attr_value
                # 避免直接操作 __all__ 列表，使用其他方式处理导出
                break

        logger.debug(f"Exported server instances from {server_name}")
    except Exception as e:
        logger.warning(f"Failed to export server instances from {server_name}: {e}")

logger.info(f"MCP Server Registry initialized with {len(registry.servers)} servers: {list(registry.servers.keys())}")
