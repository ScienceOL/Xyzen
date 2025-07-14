# Python官方库导入
from typing_extensions import Annotated, Doc, List

# FastAPI库导入
from fastapi import APIRouter, Body

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Instrument, InstrumentsData, MCPTool, MCPToolRegisterResponse
from tools import register_instruments_tools

tools_router = APIRouter(prefix="/tools", tags=["tools"])

@tools_router.post("/register")# 注册仪器&MCP工具
async def register(instruments_data: Annotated[InstrumentsData, Doc("待注册仪器和工具的数据POST传参")]) -> MCPToolRegisterResponse:
    return register_instruments_tools(instruments_data)
"""
@tools_router.delete("/delete/{instrument_id}")# 删除仪器&MCP工具
async def delete_instrument_tools(instrument_id: str):
    pass # TODO: 删除仪器和工具

@tools_router.delete("/delete/{instrument_id}/{tool_id}")# 删除仪器&MCP工具
async def delete_tool(instrument_id: str, tool_id: str):
    pass # TODO: 删除仪器和工具

@tools_router.put("/update/{instrument_id}")# 更新仪器
async def update_instrument_tools(instrument_id: str, instruments_data: Annotated[InstrumentsData, Doc("待更新仪器和工具的数据POST传参")]):
    pass # TODO: 更新仪器

@tools_router.put("/update/{instrument_id}/{tool_name}")# 更新工具
async def update_tool(instrument_id: str, tool_name: str, tool: Annotated[MCPTool, Doc("待更新工具的数据POST传参")]):
    pass # TODO: 更新工具
"""



"""# TODO:查询 待定
@tools_router.get("/list")# 获取已经注册仪器列表
async def get_tools() -> List[Instrument] | None:
    return get_instruments()

@tools_router.get("/mcp_tools")# 获取已经注册仪器构成的MCP工具列表  
async def get_mcp_list() -> List[MCPTool] | None:
    return get_mcp_tools()
"""