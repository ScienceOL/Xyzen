# Python官方库导入
from typing_extensions import Annotated, Doc, List
from logging import getLogger
import json
import os

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Action, Instrument, InstrumentsData, MCPTool, MCPToolRegisterResponse, SaveMCPTool

logger = getLogger(__name__)

def _load_existing_data() -> SaveMCPTool:
    """加载现有的MCP工具数据"""
    save_mcp_tool = SaveMCPTool()
    logger.info(f"加载现有的MCP工具数据: {save_mcp_tool}")
    return save_mcp_tool

def _is_registered(instrument: Instrument, tools: List[MCPTool]) -> bool | List[MCPTool]:
    """检查仪器和工具是否已经注册"""
    if _load_existing_data().has_instrument_by_id(instrument.instrument_id):
        un_exists_tools = []
        for tool in tools:
            if not _load_existing_data().has_tool_in_instrument(instrument, tool):
                un_exists_tools.append(tool)
        if un_exists_tools:
            logger.warning(f"工具不存在: {un_exists_tools}")
            return un_exists_tools
        else:
            return True
    else:
        logger.warning(f"仪器不存在: {instrument.name}")
        return False

def register_instruments_tools(instruments_data: InstrumentsData) -> MCPToolRegisterResponse:
    response = MCPToolRegisterResponse()
    pass # TODO: 注册仪器和工具
    return response








"""# TODO:查询 待定
def get_instruments() -> List[Instrument] | None:
    try:
        existing_data = load_existing_data()
        instruments_registered = [item.instrument for item in existing_data]
        logger.info(f"获取已经注册仪器列表成功: {len(instruments_registered)} 个仪器")
        return instruments_registered
    except Exception as e:
        logger.error(f"获取已经注册仪器列表失败: {e}")
        return None

def get_mcp_tools() -> List[MCPTool] | None:
    try:
        existing_data = load_existing_data()
        mcp_tools = []
        for item in existing_data:
            mcp_tools.extend(item.tools)
        logger.info(f"获取已经注册仪器构成的MCP工具列表成功: {len(mcp_tools)} 个工具")
        return mcp_tools
    except Exception as e:
        logger.error(f"获取已经注册仪器构成的MCP工具列表失败: {e}")
        return None
"""