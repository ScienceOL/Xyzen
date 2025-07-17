# 导入标准库
from collections.abc import AsyncGenerator  # 导入异步生成器类型，用于异步上下文管理
from contextlib import asynccontextmanager  # 导入异步上下文管理器装饰器
from typing import Any  # 导入Any类型，用于类型提示

# 导入第三方库
import anyio  # 导入异步I/O库，用于运行异步服务器
import uvicorn  # 导入ASGI服务器
from fastapi import FastAPI  # 导入FastAPI框架
from fastmcp import FastMCP  # 导入FastMCP框架，用于快速创建MCP服务器
from fastmcp.server.http import StarletteWithLifespan  # 导入带生命周期的Starlette应用

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


# 将MCP服务器转换为HTTP应用
lab_mcp_app: StarletteWithLifespan = lab_mcp.http_app(transport="streamable-http", path="/")  # 创建实验室MCP的HTTP应用
other_mcp_app: StarletteWithLifespan = other_mcp.http_app(transport="streamable-http", path="/")  # 创建其他工具MCP的HTTP应用


# 关键：使用 mcp_app 的生命周期管理器
@asynccontextmanager  # 异步上下文管理器装饰器
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    管理FastAPI应用的生命周期
    同时管理两个MCP应用的生命周期
    """
    # 使用 mcp_app 的生命周期管理器，同时启动两个MCP应用
    async with lab_mcp_app.lifespan(lab_mcp_app), other_mcp_app.lifespan(other_mcp_app):
        yield  # 应用运行期间保持MCP应用活跃


# 创建 FastAPI 应用并传入 MCP 的生命周期管理器
app = FastAPI(
    title="Xyzen Service",  # API文档标题
    description="FastAPI + MCP integrated service",  # API描述
    version="0.1.0",  # 版本号
    lifespan=lifespan,  # 设置生命周期管理器
)

# 挂载 MCP 应用到主应用的路由中
app.mount("/mcp/lab", lab_mcp_app)  # 将实验室MCP挂载到 /mcp/lab 路径
app.mount("/mcp/other", other_mcp_app)  # 将其他工具MCP挂载到 /mcp/other 路径


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
