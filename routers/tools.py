# Python官方库导入
from typing_extensions import Annotated, Doc, List

# FastAPI库导入
from fastapi import APIRouter

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Instrument, InstrumentsData
from tools import register_instruments_batch, get_instruments, get_mcp_tools

tools_router = APIRouter(prefix="/tools", tags=["tools"])

@tools_router.post("/register")# 注册仪器
async def register_tool(instruments_data: InstrumentsData) -> dict[str, bool | str | List[str]]:# 批量注册仪器
    """批量注册仪器"""
    success, message, success_list = register_instruments_batch(data=instruments_data)
    return {
        "success": success,
        "message": message,
        "success_instruments": success_list
    }

@tools_router.get("/list")# 获取已经注册仪器列表
async def get_tools() -> List[Instrument] | None:
    """获取已经注册仪器列表"""
    return get_instruments()

@tools_router.get("/mcp_tools")# 获取已经注册仪器构成的MCP工具列表  
async def get_mcp_list() -> List[Tool] | None:
    """获取已经注册仪器构成的MCP工具列表"""
    return get_mcp_tools()