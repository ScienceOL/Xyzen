# Python官方库导入
from typing_extensions import Annotated, List, Iterator, Dict
from logging import getLogger
import json
import os

# Pydantic官方库导入
from pydantic import BaseModel, Field

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from .Instrument import Instrument

logger = getLogger(__name__)

class MCPTool(Tool):
    """MCP工具"""
    tool_id: Annotated[str, Field(description="MCP工具的ID")]
    requires_license: Annotated[bool, Field(description="操作是否需要权限")] = True
    
    def __eq__(self, other) -> bool:
        """基于tool_id比较两个MCPTool"""
        if isinstance(other, MCPTool):
            return self.tool_id == other.tool_id
        return False
    
    def __hash__(self) -> int:
        """基于tool_id生成哈希值"""
        return hash(self.tool_id)

class MCPToolRegisterResponse(BaseModel):
    """MCP工具注册响应"""
    success: Annotated[bool, Field(description="是否成功")] = False
    success_instruments: Annotated[List[str], Field(description="成功注册的仪器")] = []
    success_tools: Annotated[List[str], Field(description="成功注册的工具")] = []
    failed_instruments: Annotated[List[str], Field(description="失败注册的仪器")] = []
    failed_tools: Annotated[List[str], Field(description="失败注册的工具")] = []
    registered_instruments: Annotated[List[str], Field(description="已注册的仪器")] = []
    registered_tools: Annotated[List[str], Field(description="已注册的工具")] = []

class SaveMCPTool:
    """以仪器-MCP工具映射字典为数据结构的MCP工具保存数据模型"""
    def __init__(
        self,
        save_path: Annotated[str, Field(description="保存路径")] = "data/mcp_tools.json",
    ):
        """初始化"""
        self.save_path: str = save_path
        self.data: Dict[Instrument, List[MCPTool]] = {}
        self._load_data()
    
    def _load_data(self) -> None:
        """加载数据"""
        if os.path.exists(self.save_path) and os.path.getsize(self.save_path) > 0:
            try:
                with open(self.save_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.data = self.from_dict(data).data
                    logger.info(f"MCP工具数据加载完成，数据数量：{self.__len__()}")
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"警告：加载数据时出错 {e}，使用空数据")
                self.data = {}
        else:
            if not os.path.exists(self.save_path):
                logger.info(f"MCP工具数据文件不存在，创建新文件")
            else:
                logger.info(f"MCP工具数据文件为空，使用空数据")
            self._save_data()
    
    def _save_data(self) -> None:
        """保存数据到文件"""
        try:
            os.makedirs(os.path.dirname(self.save_path), exist_ok=True)
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
            logger.info(f"MCP工具数据保存完成")
        except Exception as e:
            logger.error(f"保存数据时出错: {e}")
    
    def __getitem__(self, instrument: Instrument) -> List[MCPTool]:
        """通过仪器获取工具列表"""
        return self.data[instrument]
    
    def __setitem__(self, instrument: Instrument, tools: List[MCPTool]):
        """设置仪器的工具列表"""
        self.data[instrument] = tools
        self._save_data()
    
    def __len__(self) -> int:
        """返回仪器数量"""
        return len(self.data)
    
    def __iter__(self) -> Iterator[tuple[Instrument, List[MCPTool]]]:
        """迭代所有仪器和工具"""
        return iter(self.data.items())
    
    def __contains__(self, instrument: Instrument) -> bool:
        """检查仪器是否存在"""
        return instrument in self.data
    
    def add_instrument_tools(self, instrument: Instrument, tools: List[MCPTool]) -> None:
        """完整地添加仪器和对应工具列表，如果仪器已存在，则更新工具列表"""
        self.data[instrument] = tools
        logger.info(f"添加仪器和工具: {instrument.name}")
        self._save_data()
    
    def update_instrument_tools(self, instrument: Instrument, tools: List[MCPTool]) -> None:
        """完整地更新仪器和工具列表，如果仪器不存在，则添加仪器和工具列表"""
        if instrument in self.data:
            self.data[instrument] = tools
            logger.info(f"更新仪器和工具: {instrument.name}")
            self._save_data()
        else:
            self.add_instrument_tools(instrument, tools)
    
    def remove_instrument_tools(self, instrument: Instrument) -> None:
        """完整地删除仪器和工具列表，如果仪器不存在，则不进行任何操作"""
        if instrument in self.data:
            del self.data[instrument]
            logger.info(f"删除仪器和工具: {instrument.name}")
            self._save_data()
        else:
            logger.warning(f"仪器不存在: {instrument.name}")
    
    def get_instrument_by_id(self, instrument_id: str) -> Instrument | None:
        """通过ID获取仪器对象"""
        for instrument in self.data.keys():
            if instrument.instrument_id == instrument_id:
                return instrument
        return None
    
    def get_tools_by_instrument_id(self, instrument_id: str) -> List[MCPTool] | None:
        """通过仪器ID获取工具列表"""
        instrument = self.get_instrument_by_id(instrument_id)
        if instrument:
            return self.data[instrument]
        return None
    
    def has_instrument_by_id(self, instrument_id: str) -> bool:
        """通过ID检查仪器是否存在"""
        return self.get_instrument_by_id(instrument_id) is not None
    
    def remove_instrument_by_id(self, instrument_id: str) -> None:
        """通过ID删除仪器和工具"""
        instrument = self.get_instrument_by_id(instrument_id)
        if instrument:
            self.remove_instrument_tools(instrument)
        else:
            raise KeyError(f"仪器ID不存在: {instrument_id}")
    
    # ==================== 工具级别的操作方法 ====================
    
    def add_tool_to_instrument(self, instrument: Instrument, tool: MCPTool) -> None:
        """向指定仪器添加单个工具"""
        if instrument in self.data:
            if tool not in self.data[instrument]:
                self.data[instrument].append(tool)
                logger.info(f"向仪器 {instrument.name} 添加工具: {tool.name}")
                self._save_data()
            else:
                logger.warning(f"工具 {tool.name} 已存在于仪器 {instrument.name} 中")
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def add_tools_to_instrument(self, instrument: Instrument, tools: List[MCPTool]) -> None:
        """向指定仪器添加多个工具"""
        if instrument in self.data:
            added_count = 0
            for tool in tools:
                if tool not in self.data[instrument]:
                    self.data[instrument].append(tool)
                    added_count += 1
                else:
                    logger.warning(f"工具 {tool.name} 已存在于仪器 {instrument.name} 中")
            
            if added_count > 0:
                logger.info(f"向仪器 {instrument.name} 添加了 {added_count} 个工具")
                self._save_data()
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def remove_tool_from_instrument(self, instrument: Instrument, tool: MCPTool) -> None:
        """从指定仪器移除单个工具"""
        if instrument in self.data:
            if tool in self.data[instrument]:
                self.data[instrument].remove(tool)
                logger.info(f"从仪器 {instrument.name} 移除工具: {tool.name}")
                self._save_data()
            else:
                raise KeyError(f"工具 {tool.name} 不存在于仪器 {instrument.name} 中")
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def remove_tools_from_instrument(self, instrument: Instrument, tools: List[MCPTool]) -> None:
        """从指定仪器移除多个工具"""
        if instrument in self.data:
            removed_count = 0
            for tool in tools:
                if tool in self.data[instrument]:
                    self.data[instrument].remove(tool)
                    removed_count += 1
                else:
                    logger.warning(f"工具 {tool.name} 不存在于仪器 {instrument.name} 中")
            
            if removed_count > 0:
                logger.info(f"从仪器 {instrument.name} 移除了 {removed_count} 个工具")
                self._save_data()
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def update_tool_in_instrument(self, instrument: Instrument, old_tool: MCPTool, new_tool: MCPTool) -> None:
        """更新指定仪器中的工具"""
        if instrument in self.data:
            if old_tool in self.data[instrument]:
                index = self.data[instrument].index(old_tool)
                self.data[instrument][index] = new_tool
                logger.info(f"更新仪器 {instrument.name} 中的工具: {old_tool.name} -> {new_tool.name}")
                self._save_data()
            else:
                raise KeyError(f"工具 {old_tool.name} 不存在于仪器 {instrument.name} 中")
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def get_tools_by_name(self, instrument: Instrument, tool_name: str) -> List[MCPTool]:
        """根据工具名称获取指定仪器中的工具"""
        if instrument in self.data:
            return [tool for tool in self.data[instrument] if tool.name == tool_name]
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def has_tool_in_instrument(self, instrument: Instrument, tool: MCPTool) -> bool:
        """检查指定仪器是否包含某个工具"""
        if instrument in self.data:
            return tool in self.data[instrument]
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def clear_tools_from_instrument(self, instrument: Instrument) -> None:
        """清空指定仪器的所有工具"""
        if instrument in self.data:
            tool_count = len(self.data[instrument])
            self.data[instrument].clear()
            logger.info(f"清空仪器 {instrument.name} 的所有工具，共 {tool_count} 个")
            self._save_data()
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def get_tool_count(self, instrument: Instrument) -> int:
        """获取指定仪器的工具数量"""
        if instrument in self.data:
            return len(self.data[instrument])
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    # ==================== 通过ID的工具级别操作 ====================
    
    def add_tool_to_instrument_by_id(self, instrument_id: str, tool: MCPTool) -> None:
        """通过仪器ID向指定仪器添加工具"""
        instrument = self.get_instrument_by_id(instrument_id)
        if instrument:
            self.add_tool_to_instrument(instrument, tool)
        else:
            raise KeyError(f"仪器ID不存在: {instrument_id}")
    
    def remove_tool_from_instrument_by_id(self, instrument_id: str, tool: MCPTool) -> None:
        """通过仪器ID从指定仪器移除工具"""
        instrument = self.get_instrument_by_id(instrument_id)
        if instrument:
            self.remove_tool_from_instrument(instrument, tool)
        else:
            raise KeyError(f"仪器ID不存在: {instrument_id}")
    
    def get_tools_by_name_by_id(self, instrument_id: str, tool_name: str) -> List[MCPTool]:
        """通过仪器ID根据工具名称获取工具"""
        instrument = self.get_instrument_by_id(instrument_id)
        if instrument:
            return self.get_tools_by_name(instrument, tool_name)
        else:
            raise KeyError(f"仪器ID不存在: {instrument_id}")
    
    def to_dict(self) -> dict:
        """转换为字典格式，便于JSON序列化"""
        return {
            "instruments_tools": [
                {
                    "instrument": instrument.model_dump(),
                    "tools": [tool.model_dump() for tool in tools]
                }
                for instrument, tools in self.data.items()
            ]
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'SaveMCPTool':
        """从字典创建对象，便于JSON反序列化"""
        instance = cls.__new__(cls)  # 创建实例但不调用 __init__
        instance.save_path = "data/mcp_tools.json"  # 设置默认路径
        instance.data = {}  # 初始化空数据
        
        for item in data.get("instruments_tools", []):
            instrument = Instrument(**item["instrument"])
            tools = [MCPTool(**tool_data) for tool_data in item["tools"]]
            instance.data[instrument] = tools
        return instance

