# 导入异步生成器类型，用于异步上下文管理器的返回类型注解
from collections.abc import AsyncGenerator
# 导入异步上下文管理器装饰器，用于管理应用的生命周期
from contextlib import asynccontextmanager

# 导入uvicorn，用作ASGI服务器启动FastAPI应用
import uvicorn
# 导入FastAPI核心类，用于创建Web应用
from fastapi import FastAPI
# 导入FastMCP的HTTP应用创建函数，用于将MCP服务器转换为HTTP应用
from fastmcp.server.http import create_streamable_http_app
# 导入Starlette的路由挂载类，用于挂载子应用到主应用
from starlette.routing import Mount
# 导入Starlette的ASGI类型定义，用于类型注解
from starlette.types import Receive, Scope, Send

# 导入API路由，包含RESTful API端点
from handler.api import api_router
# 导入MCP服务器实例，lab_mcp用于实验室功能，other_mcp用于其他功能
from handler.mcp import lab_mcp, other_mcp
# 导入配置模块，包含应用的各种配置信息
from internal import configs
# 导入Casdoor认证中间件，用于MCP服务的身份验证
from middleware.auth.casdoor import casdoor_mcp_auth
# 导入日志配置，用于uvicorn服务器的日志设置
from middleware.logger import LOGGING_CONFIG


# TODO: 自动化 MCP Server 发现并自动挂载到 FastAPI 主路由
# 定义异步生命周期管理器，用于管理应用启动和关闭时的资源
# 这是FastAPI推荐的生命周期管理方式，替代了startup和shutdown事件
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Laboratory MCP Application
    # 创建实验室功能的MCP HTTP应用
    # server: 传入lab_mcp实例，这是一个FastMCP服务器
    # streamable_http_path: 设置MCP服务器的相对路径为根路径
    # debug: 根据配置决定是否启用调试模式
    # auth: 添加Casdoor认证中间件，用于用户身份验证
    lab_app = create_streamable_http_app(
        server=lab_mcp,  # FastMCP Instance, don't need to pass auth
        streamable_http_path="/",  # Relative path for the MCP server
        debug=configs.Debug,
        auth=casdoor_mcp_auth,
    )

    # 创建其他功能的MCP HTTP应用
    # 与lab_app类似，但没有配置认证中间件，说明这个服务不需要身份验证
    other_app = create_streamable_http_app(
        server=other_mcp,
        streamable_http_path="/",
        debug=configs.Debug,
    )

    # 将 FastMCP 应用的生命周期管理器集成到 FastAPI 中
    # 使用async with确保MCP应用的生命周期与FastAPI应用同步启动和关闭
    # 这样可以确保MCP服务器在FastAPI启动时启动，关闭时关闭
    async with lab_app.router.lifespan_context(lab_app), other_app.router.lifespan_context(other_app):
        # 将应用存储在 FastAPI 的状态中，以便在路由中使用
        # app.state是FastAPI提供的应用级状态存储，可以在整个应用生命周期中访问
        app.state.lab_app = lab_app
        app.state.other_app = other_app
        # yield表示应用启动完成，进入运行状态
        # yield之后的代码会在应用关闭时执行（这里没有关闭逻辑）
        yield


# 创建FastAPI应用实例
# title: 应用标题，会显示在自动生成的API文档中
# description: 应用描述，用于API文档说明
# version: 应用版本号
# lifespan: 指定生命周期管理器，用于管理应用启动和关闭
app = FastAPI(
    title="Xyzen FastAPI Service",
    description="Xyzen is AI-powered service with FastAPI and MCP",
    version="0.1.0",
    lifespan=lifespan,
)

# 将API路由器包含到主应用中
# api_router包含所有RESTful API端点，如聊天接口等
app.include_router(
    api_router,
)


# Router Handlers
# 定义实验室MCP服务的ASGI处理器
# 这是一个ASGI应用函数，用于处理HTTP请求并转发给lab_app
async def lab_handler(scope: Scope, receive: Receive, send: Send) -> None:
    # 从应用状态中获取lab_app并处理请求
    # scope: 包含请求信息的字典，如路径、方法、头部等
    # receive: 用于接收请求体的异步函数
    # send: 用于发送响应的异步函数
    await app.state.lab_app(scope, receive, send)


# 定义其他功能MCP服务的ASGI处理器
# 与lab_handler类似，用于处理转发给other_app的请求
async def other_handler(scope: Scope, receive: Receive, send: Send) -> None:
    await app.state.other_app(scope, receive, send)


# Use Mount to register the MCP applications
# 使用Mount将MCP应用挂载到特定路径
# 这种方式可以将子应用挂载到主应用的特定路径下
# Mount会将匹配路径前缀的请求转发给对应的处理器
app.router.routes.extend(
    [
        # 将实验室MCP服务挂载到/mcp/lab路径
        # 所有以/mcp/lab开头的请求都会被转发给lab_handler处理
        Mount("/mcp/lab", lab_handler),
        # 将其他功能MCP服务挂载到/mcp/other路径
        Mount("/mcp/other", other_handler),
    ]
)


# 应用入口点，当直接运行此文件时执行
if __name__ == "__main__":
    # 使用uvicorn启动FastAPI应用
    # "cmd.main:app": 指定应用模块路径和应用实例名称
    # host: 服务器监听的主机地址，从配置文件获取
    # port: 服务器监听的端口号，从配置文件获取
    # log_config: 日志配置，使用自定义的日志配置
    # log_level: 日志级别，从配置文件获取
    # reload: 是否启用自动重载，在调试模式下启用，代码变更时自动重启
    uvicorn.run(
        "cmd.main:app",
        host=configs.Host,
        port=configs.Port,
        log_config=LOGGING_CONFIG,
        log_level=configs.Logger.Level,
        reload=configs.Debug,
    )

# 整体架构思路总结：
# 1. 这是一个集成了FastMCP的FastAPI应用，实现了AI驱动的服务架构
# 2. 使用现代的异步生命周期管理，确保MCP服务器与FastAPI应用同步启动和关闭
# 3. 通过Mount机制将多个MCP服务挂载到不同路径，实现服务的模块化管理
# 4. lab_mcp配置了认证中间件，提供安全的实验室功能访问
# 5. other_mcp不需要认证，可能用于公开的功能服务
# 6. 整个应用支持调试模式、自定义日志配置和热重载等开发特性
# 7. 通过app.state在应用级别共享MCP应用实例，实现了良好的资源管理
