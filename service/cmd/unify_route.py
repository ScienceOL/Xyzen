# 这个文件提供了一个简单的FastAPI应用，集成了多个MCP服务器，使用统一的路由处理方式
from collections.abc import AsyncGenerator  # 导入异步生成器类型，用于异步上下文管理
from contextlib import asynccontextmanager  # 导入异步上下文管理器装饰器
from typing import Any, MutableMapping  # 导入类型提示，Any用于任意类型，MutableMapping用于可变映射

import anyio  # 导入异步I/O库，用于运行异步服务器
import uvicorn  # 导入ASGI服务器
from fastapi import FastAPI, Request, Response  # 导入FastAPI框架和请求响应对象
from fastmcp import FastMCP  # 导入FastMCP框架，用于快速创建MCP服务器
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager  # 导入MCP的HTTP会话管理器
from starlette.types import Receive, Scope  # 导入ASGI协议相关的类型定义

# 创建 MCP 服务器实例
lab_mcp: FastMCP = FastMCP("Lab 🚀")  # 创建实验室MCP服务器，用于科学计算工具
other_mcp: FastMCP = FastMCP("Other Tools 🛠️")  # 创建其他工具MCP服务器，用于通用工具


# 在实验室MCP服务器上注册工具函数
@lab_mcp.tool  # 使用装饰器将函数注册为MCP工具
def multiply(a: float, b: float) -> float:
    """Multiplies two numbers."""  # 工具描述：将两个数字相乘
    return a * b  # 返回乘法结果


# 在其他工具MCP服务器上注册工具函数
@other_mcp.tool  # 使用装饰器将函数注册为MCP工具
def add(a: float, b: float) -> float:
    """Adds two numbers."""  # 工具描述：将两个数字相加
    return a + b  # 返回加法结果


# 创建会话管理器 - 手动管理MCP会话
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


# 生命周期管理 - 只需要管理会话管理器
@asynccontextmanager  # 异步上下文管理器装饰器
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    管理FastAPI应用的生命周期
    启动和关闭MCP会话管理器
    """
    # 启动会话管理器，应用运行期间保持活跃
    async with lab_session_manager.run(), other_session_manager.run():
        yield  # 应用运行期间保持会话管理器活跃


# 创建 FastAPI 应用
app = FastAPI(
    title="Xyzen Service",  # API文档标题
    description="FastAPI + MCP integrated service",  # API描述
    version="0.1.0",  # 版本号
    lifespan=lifespan,  # 设置生命周期管理器
)


# 直接添加 MCP 处理路由 - 使用FastAPI路由而不是ASGI处理器
async def handle_lab_mcp(request: Request) -> Response:
    """
    处理 Lab MCP 请求
    将FastAPI请求转换为ASGI格式，然后交给会话管理器处理
    """
    scope: Scope = request.scope  # 获取请求的作用域信息
    receive: Receive = request.receive  # 获取接收数据的函数

    # 创建一个简单的 send 函数来捕获响应
    # 这些变量用于存储响应信息
    response_started = False  # 标记响应是否已开始
    status_code = 200  # 默认状态码
    headers: list[tuple[bytes, bytes]] = []  # 响应头列表
    body_parts: list[bytes] = []  # 响应体片段列表

    # 定义send函数，用于接收ASGI响应消息
    async def send(message: MutableMapping[str, Any]) -> None:
        """
        处理ASGI响应消息
        message: ASGI响应消息字典
        """
        nonlocal response_started, status_code, headers  # 声明使用外部变量

        if message["type"] == "http.response.start":  # 响应开始消息
            response_started = True  # 标记响应已开始
            status_code = message["status"]  # 获取状态码
            headers = message.get("headers", [])  # 获取响应头
        elif message["type"] == "http.response.body":  # 响应体消息
            body_parts.append(message.get("body", b""))  # 添加响应体片段

    # 调用会话管理器处理请求
    await lab_session_manager.handle_request(scope, receive, send)

    # 构建FastAPI响应对象
    body = b"".join(body_parts)  # 合并所有响应体片段
    response_headers = {key.decode(): value.decode() for key, value in headers}  # 转换响应头格式

    # 返回FastAPI Response对象
    return Response(
        content=body,  # 响应内容
        status_code=status_code,  # 状态码
        headers=response_headers,  # 响应头
    )


# 处理其他MCP请求的函数
async def handle_other_mcp(request: Request) -> Response:
    """
    处理 Other MCP 请求
    与handle_lab_mcp类似，但处理other_mcp的请求
    """
    scope: Scope = request.scope  # 获取请求的作用域信息
    receive: Receive = request.receive  # 获取接收数据的函数

    # 响应处理变量
    response_started = False  # 标记响应是否已开始
    status_code = 200  # 默认状态码
    headers: list[tuple[bytes, bytes]] = []  # 响应头列表
    body_parts: list[bytes] = []  # 响应体片段列表

    # 定义send函数，用于接收ASGI响应消息
    async def send(message: MutableMapping[str, Any]) -> None:
        """
        处理ASGI响应消息
        """
        nonlocal response_started, status_code, headers  # 声明使用外部变量

        if message["type"] == "http.response.start":  # 响应开始消息
            response_started = True  # 标记响应已开始
            status_code = message["status"]  # 获取状态码
            headers = message.get("headers", [])  # 获取响应头
        elif message["type"] == "http.response.body":  # 响应体消息
            body_parts.append(message.get("body", b""))  # 添加响应体片段

    # 调用其他MCP会话管理器处理请求
    await other_session_manager.handle_request(scope, receive, send)

    # 构建响应
    body = b"".join(body_parts)  # 合并所有响应体片段
    response_headers = {key.decode(): value.decode() for key, value in headers}  # 转换响应头格式

    # 返回FastAPI Response对象
    return Response(
        content=body,  # 响应内容
        status_code=status_code,  # 状态码
        headers=response_headers,  # 响应头
    )


# 添加 MCP 路由 - 使用FastAPI的路由系统
# 使用路径参数 {path:path} 来捕获所有子路径
app.add_api_route("/mcp/lab/{path:path}", handle_lab_mcp, methods=["GET", "POST", "PUT", "DELETE", "PATCH"])  # 添加实验室MCP路由
app.add_api_route("/mcp/other/{path:path}", handle_other_mcp, methods=["GET", "POST", "PUT", "DELETE", "PATCH"])  # 添加其他MCP路由


# 根路径处理器
@app.get("/")  # 处理GET请求到根路径
async def root() -> dict[str, str]:
    """返回服务的基本信息"""
    return {"message": "Xyzen Service with FastAPI and MCP"}


# 健康检查端点
@app.get("/health")  # 处理GET请求到健康检查路径
async def health_check() -> dict[str, str]:
    """返回服务健康状态"""
    return {"status": "healthy", "service": "xyzen"}


# MCP状态检查端点
@app.get("/mcp/status")  # 处理GET请求到MCP状态路径
async def mcp_status() -> dict[str, Any]:
    """
    返回MCP服务的状态信息
    包括服务地址和可用工具列表
    """
    return {
        "lab_tools": "http://127.0.0.1:48200/mcp/lab/",  # 实验室工具服务地址
        "other_tools": "http://127.0.0.1:48200/mcp/other/",  # 其他工具服务地址
        "available_tools": {"lab": ["multiply"], "other": ["add"]},  # 可用工具列表
    }


# 配置uvicorn服务器参数
config_kwargs: dict[str, Any] = {
    "timeout_graceful_shutdown": 0,  # 优雅关闭超时时间（0表示立即关闭）
    "lifespan": "on",  # 启用生命周期管理
}

# 创建uvicorn配置对象
config = uvicorn.Config(app, host="127.0.0.1", port=48200, **config_kwargs)  # 配置服务器参数
server = uvicorn.Server(config)  # 创建服务器实例

# 主程序入口
if __name__ == "__main__":
    anyio.run(server.serve)  # 使用anyio运行服务器（支持异步操作）
