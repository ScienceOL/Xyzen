# Python官方库导入
from typing_extensions import Annotated, List, Iterator

# Pydantic官方库导入
from pydantic import Field

# MCP官网SDK导入
from mcp.types import Tool

# 本地导入
from .Instrument import Instrument

class MCPTool(Tool):# MCP工具
    tid: Annotated[str, Field(description="MCP工具的ID")]
    requires_license: Annotated[bool, Field(description="操作是否需要权限")] = True

class SaveMCPTool:# 保存MCP工具
    def __init__(self, instrument: Instrument, tools: List[MCPTool]):
        self.instrument = instrument
        self.tools = tools

    def __getitem__(self, key: int) -> MCPTool:
        return self.tools[key]

    def __setitem__(self, key: int, value: MCPTool):
        self.tools[key] = value

    def __len__(self) -> int:
        return len(self.tools)

    def __iter__(self) -> Iterator[MCPTool]:            
        return iter(self.tools)
    
    def to_dict(self) -> dict:
        """转换为字典格式，便于JSON序列化"""
        return {
            "instrument": self.instrument.model_dump(),
            "tools": [tool.model_dump() for tool in self.tools]
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'SaveMCPTool':
        """从字典创建对象，便于JSON反序列化"""
        instrument = Instrument(**data["instrument"])
        tools = [MCPTool(**tool_data) for tool_data in data["tools"]]
        return cls(instrument, tools)