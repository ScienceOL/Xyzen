# Python官方库导入
from typing_extensions import Annotated, Doc, List
from logging import getLogger
import json

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Instrument, InstrumentsData

logger = getLogger(__name__)

def register_instruments_batch(data: InstrumentsData) -> tuple[bool, str, List[str]]:# 批量注册仪器
    """批量注册仪器"""
    success_instruments = []
    failed_instruments = []
    for instrument_id, instrument in data.Instruments.items():
        try:    
            # 注册仪器
            if register_instrument(instrument):
                success_instruments.append(instrument.name)
                logger.info(f"仪器 {instrument.name} 注册成功")
            else:
                failed_instruments.append(instrument.name)
                logger.error(f"仪器 {instrument.name} 注册失败")
                
        except Exception as e:
            failed_instruments.append(instrument.name)
            logger.error(f"处理仪器 {instrument_id} 时发生错误: {e}")
    
    # 生成结果消息
    if success_instruments and not failed_instruments:
        message = f"所有仪器注册成功，共 {len(success_instruments)} 个仪器"
        return True, message, success_instruments
    elif success_instruments and failed_instruments:
        message = f"部分仪器注册成功: {len(success_instruments)} 个成功, {len(failed_instruments)} 个失败"
        return False, message, success_instruments
    else:
        message = f"所有仪器注册失败，共 {len(failed_instruments)} 个仪器"
        return False, message, []

def _is_registered(instrument: Annotated[Instrument, Doc("注册仪器")]) -> bool:# 判断仪器是否已经注册
    is_registered = False
    with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
        instruments_tools: dict[Instrument, Tool] = json.load(f)
        for instrument_registered, _ in instruments_tools.items():
            if instrument_registered.name == instrument.name:
                is_registered = True
                break
        # TODO 判断动作是否已经注册
    return is_registered

def register_instrument(instrument: Annotated[Instrument, Doc("注册仪器")]) -> bool:# 注册仪器
    if _is_registered(instrument):
        logger.warning(f"仪器{instrument.name}已注册")
        return True
    else:
        try:
            # TODO 注册仪器(每一个仪器的动作与MCPTool一一对应，要求生成MCPTool同时生成对应的Tool ID)
            logger.info(f"仪器{instrument.name}注册成功")
            return True
        except Exception as e:
            logger.error(f"注册仪器失败: {e}")
            return False

def get_instruments() -> List[Instrument] | None:# 获取已经注册仪器列表
    """获取已经注册仪器列表"""
    instruments_registered: List[Instrument] = []
    try:
        with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
            instruments_tools: dict[Instrument, List[Tool]] = json.load(f)
        for instrument, _ in instruments_tools.items(): # 只获取仪器列表，不获取工具列表
            instruments_registered.append(instrument)
        logger.info(f"获取已经注册仪器列表成功: {instruments_registered}")
        return instruments_registered
    except Exception as e:
        logger.error(f"获取已经注册仪器列表失败: {e}")
        return None

def get_mcp_tools() -> List[Tool] | None:# 获取已经注册仪器构成的MCP工具列表
    """获取已经注册仪器构成的MCP工具列表"""
    mcp_tools: List[Tool] = []
    try:
        with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
            instruments_tools: dict[Instrument, List[Tool]] = json.load(f)
        for _, tools in instruments_tools.items(): # 只获取工具列表，不获取仪器列表
            mcp_tools.extend(tools)
        logger.info(f"获取已经注册仪器构成的MCP工具列表成功: {mcp_tools}")
        return mcp_tools
    except Exception as e:
        logger.error(f"获取已经注册仪器构成的MCP工具列表失败: {e}")
        return None