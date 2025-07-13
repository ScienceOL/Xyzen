# Python官方库导入
from typing_extensions import Annotated, List, Iterator, Dict
import json
import os

# Pydantic官方库导入
from pydantic import Field

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from .Instrument import Instrument

class MCPTool(Tool):# MCP工具
    tool_id: Annotated[str, Field(description="MCP工具的ID")]
    requires_license: Annotated[bool, Field(description="操作是否需要权限")] = True

class SaveMCPTool:# 以仪器-MCP工具映射字典为数据结构的MCP工具保存数据模型
    def __init__(
        self,
        save_path: Annotated[str, Field(description="保存路径")] = "data/mcp_tools.json"
    ):
        self.save_path: str = save_path
        self.data: Dict[Instrument, List[MCPTool]] = {}  # 直接使用Instrument作为键
        self._load_data()
    
    def _load_data(self) -> None:# 加载数据
        if os.path.exists(self.save_path):
            try:
                with open(self.save_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 解析数据为对象
                    for item in data.get("instruments_tools", []):
                        instrument = Instrument(**item["instrument"])
                        tools = [MCPTool(**tool_data) for tool_data in item["tools"]]
                        self.data[instrument] = tools
            except (json.JSONDecodeError, KeyError) as e:
                print(f"警告：加载数据时出错 {e}，使用空数据")
                self.data = {}
        else:
            # 文件不存在时创建空文件
            self._save_data()
    
    def _save_data(self) -> None:
        """保存数据到文件"""
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(self.save_path), exist_ok=True)
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存数据时出错: {e}")
    
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
        """添加仪器和工具"""
        self.data[instrument] = tools
        self._save_data()
    
    def update_instrument_tools(self, instrument: Instrument, tools: List[MCPTool]) -> None:
        """更新仪器和工具"""
        if instrument in self.data:
            self.data[instrument] = tools
            self._save_data()
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
    def remove_instrument_tools(self, instrument: Instrument) -> None:
        """删除仪器和工具"""
        if instrument in self.data:
            del self.data[instrument]
            self._save_data()
        else:
            raise KeyError(f"仪器不存在: {instrument.name}")
    
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
        instance = cls()
        for item in data.get("instruments_tools", []):
            instrument = Instrument(**item["instrument"])
            tools = [MCPTool(**tool_data) for tool_data in item["tools"]]
            instance.data[instrument] = tools
        return instance

