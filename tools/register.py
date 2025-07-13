# Python官方库导入
from typing_extensions import Annotated, Doc, List
from logging import getLogger
import json
import os

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from models import Action, Instrument, InstrumentsData, MCPTool, SaveMCPTool

logger = getLogger(__name__)

def load_existing_data() -> List[SaveMCPTool]:
    """加载现有的MCP工具数据"""
    try:
        if not os.path.exists("data/mcp_tools.json") or os.path.getsize("data/mcp_tools.json") == 0:
            return []
        
        with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # 如果数据是列表格式，直接返回
        if isinstance(data, list):
            return [SaveMCPTool.from_dict(item) for item in data]
        # 如果是单个对象格式，转换为列表
        elif isinstance(data, dict):
            return [SaveMCPTool.from_dict(data)]
        else:
            return []
            
    except Exception as e:
        logger.error(f"加载现有数据失败: {e}")
        return []

def save_data_to_file(data: List[SaveMCPTool]):
    """保存数据到文件"""
    try:
        # 确保目录存在
        os.makedirs("data", exist_ok=True)
        
        # 转换为字典列表
        data_dict = [item.to_dict() for item in data]
        
        with open("data/mcp_tools.json", "w", encoding="utf-8") as f:
            json.dump(data_dict, f, ensure_ascii=False, indent=4)
            
        logger.info("数据保存成功")
        
    except Exception as e:
        logger.error(f"保存数据失败: {e}")
        raise

def find_existing_instrument(instrument_name: str, existing_data: List[SaveMCPTool]) -> SaveMCPTool | None:
    """查找现有的仪器"""
    for item in existing_data:
        if item.instrument.name == instrument_name:
            return item
    return None

def merge_instrument_tools(existing: SaveMCPTool, new_instrument: Instrument) -> SaveMCPTool:
    """合并仪器的工具，避免重复"""
    existing_tool_names = {tool.name for tool in existing.tools}
    new_tools = []
    
    # 添加现有的工具
    new_tools.extend(existing.tools)
    
    # 添加新的工具（避免重复）
    for action_id, action in new_instrument.actions.items():
        tool_name = action.name
        if tool_name not in existing_tool_names:
            mcp_tool = MCPTool(
                name=action.name,
                description=action.description,
                inputSchema=action.parameters,
                tid=f"{new_instrument.name}&{action_id}"
            )
            new_tools.append(mcp_tool)
            existing_tool_names.add(tool_name)
            logger.info(f"添加新工具: {tool_name}")
        else:
            logger.info(f"工具已存在，跳过: {tool_name}")
    
    return SaveMCPTool(instrument=new_instrument, tools=new_tools)

def register_instruments_batch(data: InstrumentsData) -> tuple[bool, str, List[str]]:
    """批量注册仪器 - 支持增量更新"""
    success_instruments = []
    failed_instruments = []
    
    # 加载现有数据
    existing_data = load_existing_data()
    logger.info(f"加载现有数据: {len(existing_data)} 个仪器")
    
    for instrument_id, instrument in data.Instruments.items():
        try:
            # 检查仪器是否已存在
            existing_instrument = find_existing_instrument(instrument.name, existing_data)
            
            if existing_instrument:
                # 仪器已存在，合并工具
                logger.info(f"仪器 {instrument.name} 已存在，进行增量更新")
                updated_instrument = merge_instrument_tools(existing_instrument, instrument)
                
                # 更新现有数据
                for i, item in enumerate(existing_data):
                    if item.instrument.name == instrument.name:
                        existing_data[i] = updated_instrument
                        break
                        
                success_instruments.append(instrument.name)
                logger.info(f"仪器 {instrument.name} 增量更新成功")
                
            else:
                # 仪器不存在，创建新的
                logger.info(f"仪器 {instrument.name} 不存在，创建新的")
                mcp_tools: List[MCPTool] = []
                
                for action_id, action in instrument.actions.items():
                    mcp_tool = MCPTool(
                        name=action.name,
                        description=action.description,
                        inputSchema=action.parameters,
                        tid=f"{instrument.name}&{action_id}"
                    )
                    mcp_tools.append(mcp_tool)
                
                new_save_mcp_tool = SaveMCPTool(instrument=instrument, tools=mcp_tools)
                existing_data.append(new_save_mcp_tool)
                
                success_instruments.append(instrument.name)
                logger.info(f"仪器 {instrument.name} 注册成功")
                
        except Exception as e:
            failed_instruments.append(instrument.name)
            logger.error(f"处理仪器 {instrument_id} 时发生错误: {e}")
    
    # 保存更新后的数据
    try:
        save_data_to_file(existing_data)
    except Exception as e:
        logger.error(f"保存数据失败: {e}")
        return False, f"保存数据失败: {e}", []
    
    # 生成结果消息
    if success_instruments and not failed_instruments:
        message = f"所有仪器处理成功，共 {len(success_instruments)} 个仪器"
        return True, message, success_instruments
    elif success_instruments and failed_instruments:
        message = f"部分仪器处理成功: {len(success_instruments)} 个成功, {len(failed_instruments)} 个失败"
        return False, message, success_instruments
    else:
        message = f"所有仪器处理失败，共 {len(failed_instruments)} 个仪器"
        return False, message, []

def _is_registered(instrument: Annotated[Instrument, Doc("注册仪器")]) -> bool:
    """判断仪器是否已经注册"""
    existing_data = load_existing_data()
    return find_existing_instrument(instrument.name, existing_data) is not None

def register_instrument(instrument: Annotated[Instrument, Doc("注册仪器")]) -> bool:
    """注册单个仪器 - 保持向后兼容"""
    if _is_registered(instrument):
        logger.warning(f"仪器{instrument.name}已注册")
        return True
    else:
        try:
            # 创建临时的InstrumentsData对象
            temp_data = InstrumentsData(Instruments={instrument.name: instrument})
            success, message, success_list = register_instruments_batch(temp_data)
            return success
        except Exception as e:
            logger.error(f"注册仪器失败: {e}")
            return False

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