# Python官方库导入
from typing_extensions import Annotated, Doc, List, Tuple
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

def _is_registered(save_mcp_tool: SaveMCPTool, instrument: Instrument, tools: List[MCPTool]) -> Tuple[bool, str]:
    """检查仪器和工具是否已经注册"""
    if save_mcp_tool.has_instrument_by_id(instrument.instrument_id):
        missing_tools = []
        for tool in tools:
            if not save_mcp_tool.has_tool_in_instrument(instrument, tool):
                missing_tools.append(tool.name)
        
        if missing_tools:
            logger.warning(f"仪器 {instrument.name} 存在，但缺少工具: {missing_tools}")
            return False, f"{', '.join(missing_tools)}工具未注册"
        else:
            logger.info(f"仪器 {instrument.name} 和所有工具都已注册")
            return True, "仪器和工具都已注册"
    else:
        logger.warning(f"仪器未注册: {instrument.name}")
        return False, f"{instrument.name}仪器未注册"

def actions_to_mcp_tools(actions: List[Action]) -> List[MCPTool]:
    """将动作转换为MCP工具"""
    mcp_tools = []
    for action in actions:
        mcp_tools.append(
            MCPTool(
            name=action.name,
            description=action.description,
            inputSchema=action.parameters,
            outputSchema=action.output,
            tool_id=action.action_id,
            requires_license=True,
            )
        )
    return mcp_tools

def register_instruments_tools(instruments_data: InstrumentsData) -> MCPToolRegisterResponse:
    """注册仪器和工具"""
    response = MCPToolRegisterResponse()
    save_mcp_tool = _load_existing_data()
    
    for instrument in instruments_data.instruments: # 遍历仪器
        tools = actions_to_mcp_tools(instrument.actions)
        is_registered, status = _is_registered(save_mcp_tool, instrument, tools)
        
        if is_registered:  # 仪器和工具都已注册
            response.registered_instruments.append(instrument.name)
            response.registered_tools.extend([tool.name for tool in tools])
            logger.info(f"✅ 仪器 {instrument.name} 和所有工具都已注册完成")
            logger.info(f"   已注册的工具: {[tool.name for tool in tools]}")
            
        elif "仪器未注册" in status:  # 仪器未注册
            try:
                save_mcp_tool.add_instrument_tools(instrument, tools)
                response.success_instruments.append(instrument.name)
                response.success_tools.extend([tool.name for tool in tools])
                logger.info(f"✅ 仪器 {instrument.name} 注册成功")
                logger.info(f"   新注册的工具: {[tool.name for tool in tools]}")
            except Exception as e:
                logger.error(f"❌ 注册仪器和工具失败: {e}")
                response.failed_instruments.append(instrument.name)
                response.failed_tools.extend([tool.name for tool in tools])
                
        elif "工具未注册" in status:  # 仪器已注册但工具不完整
            response.registered_instruments.append(instrument.name)
            registered_tools = []
            new_tools = []
            
            for tool in tools:
                try:
                    if save_mcp_tool.has_tool_in_instrument(instrument, tool):
                        response.registered_tools.append(tool.name)
                        registered_tools.append(tool.name)
                    else:
                        save_mcp_tool.add_tool_to_instrument(instrument, tool)
                        logger.info(f"✅ 工具 {tool.name} 注册成功")
                        response.success_tools.append(tool.name)
                        new_tools.append(tool.name)
                except Exception as e:
                    logger.error(f"❌ 工具 {tool.name} 注册失败: {e}")
                    response.failed_tools.append(tool.name)
            
            if registered_tools:
                logger.info(f"📋 仪器 {instrument.name} 中已存在的工具: {registered_tools}")
            if new_tools:
                logger.info(f"✅ 仪器 {instrument.name} 新注册的工具: {new_tools}")
                logger.info(f"🎉 仪器 {instrument.name} 所有工具注册完成")
        else:
            logger.error(f"注册仪器和工具失败: {status}")
            response.failed_instruments.append(instrument.name)
            response.failed_tools.extend([tool.name for tool in tools])
    if not response.failed_instruments and not response.failed_tools:
        response.success = True
        logger.info(f"注册仪器和工具成功: {response}")
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