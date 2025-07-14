# Python官方库导入
from typing_extensions import Annotated, Doc, List

# FastAPI库导入
from fastapi import APIRouter

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Instrument, InstrumentsData, MCPTool
from tools import register_instruments_batch

tools_router = APIRouter(prefix="/tools", tags=["tools"])

@tools_router.post("/register")# 注册仪器&MCP工具
async def register_tool(instruments_data: InstrumentsData) -> dict[str, bool | str | List[str]]:# 批量注册仪器
    """批量注册仪器"""
    success, message, success_list = register_instruments_batch(data=instruments_data)
    return {
        "success": success,
        "message": message,
        "success_instruments": success_list
    }

"""# TODO:删除 待定
@tools_router.delete("/delete")# 删除仪器&MCP工具
async def delete_tool(instrument_id: str):
    pass
"""

"""# TODO:修改 待定
@tools_router.put("/update")# 修改仪器&MCP工具
async def update_tool(instrument_id: str, instrument: Instrument):
    pass
"""

"""# TODO:查询 待定
@tools_router.get("/list")# 获取已经注册仪器列表
async def get_tools() -> List[Instrument] | None:
    return get_instruments()

@tools_router.get("/mcp_tools")# 获取已经注册仪器构成的MCP工具列表  
async def get_mcp_list() -> List[MCPTool] | None:
    return get_mcp_tools()
"""