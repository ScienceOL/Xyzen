# 导入标准库
import logging  # 导入日志模块，用于记录程序运行信息
from collections.abc import AsyncGenerator  # 导入异步生成器类型，用于异步上下文管理
from contextlib import asynccontextmanager  # 导入异步上下文管理器装饰器

# 导入第三方库
import uvicorn  # 导入ASGI服务器，用于运行FastAPI应用
from fastapi import FastAPI  # 导入FastAPI框架，用于构建Web API
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager  # 导入MCP的HTTP会话管理器
from starlette.routing import Mount  # 导入路由挂载功能，用于将子应用挂载到主应用
from starlette.types import Receive, Scope, Send  # 导入ASGI协议相关的类型定义

# 导入项目内部模块
from handler.mcp import lab_mcp, other_mcp  # 导入MCP处理器模块
from middleware.logger import LOGGING_CONFIG  # 导入日志配置
from utils.scope import serialize_scope  # 导入作用域序列化工具

# 创建日志记录器实例
logger = logging.getLogger(__name__)


# TODO: 自动化 MCP Server 发现并自动挂载到 FastAPI 主路由
# 创建实验室MCP的会话管理器
lab_session_manager = StreamableHTTPSessionManager(
    app=lab_mcp._mcp_server,  # 使用实验室MCP服务器
    event_store=None,  # 事件存储为空（不使用事件存储）
    json_response=False,  # 不使用JSON响应格式
    stateless=False,  # 使用有状态模式
)

# 创建其他MCP的会话管理器
other_session_manager = StreamableHTTPSessionManager(
    app=other_mcp._mcp_server,  # 使用其他MCP服务器
    event_store=None,  # 事件存储为空
    json_response=False,  # 不使用JSON响应格式
    stateless=False,  # 使用有状态模式
)


# ASGI 处理器 - 处理实验室MCP的请求
async def handle_lab_asgi(scope: Scope, receive: Receive, send: Send) -> None:
    """
    处理实验室MCP的ASGI请求
    scope: 请求的作用域信息（包含路径、方法、头部等）
    receive: 接收请求数据的函数
    send: 发送响应数据的函数
    """
    logger.info(f"Handling request for lab MCP: {scope['path']}")  # 记录请求路径
    logger.debug(f"Scope: {serialize_scope(scope)}")  # 记录详细的作用域信息

    # 从请求头中获取认证令牌（如果需要的话）
    token = next((v.decode() for k, v in scope.get("headers", []) if k == b"authorization"), None)
    if token:
        logger.debug(f"Authorization token: {token}")  # 记录认证令牌

    # 将请求转发给实验室MCP会话管理器处理
    await lab_session_manager.handle_request(scope, receive, send)


# ASGI 处理器 - 处理其他MCP的请求
async def handle_other_asgi(scope: Scope, receive: Receive, send: Send) -> None:
    """
    处理其他MCP的ASGI请求
    """
    # 将请求转发给其他MCP会话管理器处理
    await other_session_manager.handle_request(scope, receive, send)


# 应用生命周期管理器
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    管理FastAPI应用的生命周期
    在应用启动时启动MCP会话管理器，在应用关闭时清理资源
    """
    # 同时启动两个MCP会话管理器
    async with lab_session_manager.run(), other_session_manager.run():
        yield  # 应用运行期间保持会话管理器活跃


# 创建FastAPI应用实例
app = FastAPI(
    title="Xyzen Service - Optimized",  # API文档标题
    description="FastAPI + MCP integrated service",  # API描述
    version="0.1.0",  # 版本号
    lifespan=lifespan,  # 设置生命周期管理器
)

# 使用 Mount 但直接挂载 ASGI 处理器（最优性能）
# 将MCP处理器挂载到主应用的路由中
app.router.routes.extend(
    [
        Mount("/mcp/lab", handle_lab_asgi),  # 将实验室MCP挂载到 /mcp/lab 路径
        Mount("/mcp/other", handle_other_asgi),  # 将其他MCP挂载到 /mcp/other 路径
    ]
)


# 主程序入口
if __name__ == "__main__":
    # 使用uvicorn启动FastAPI应用
    uvicorn.run(
        "cmd.main:app",  # 应用模块路径
        host="127.0.0.1",  # 监听地址
        port=48200,  # 监听端口
        log_config=LOGGING_CONFIG,  # 日志配置
        log_level="debug",  # 日志级别
        reload=True,  # 开发模式，代码修改后自动重启
    )
