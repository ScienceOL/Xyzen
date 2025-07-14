from pydantic import BaseModel, Field
from typing import Annotated, Literal
from pathlib import Path
import json
from .MCPTool import MCPTool
class Lab(BaseModel):
    # 实验室基础信息
    name: Annotated[str | None, Field(description="实验室的名称")]
    description: Annotated[str | None, Field(description="实验室的描述")]
    # 实验室管理参数信息
    lab_id: Annotated[int | None, Field(description="实验室的Lab ID")]
    type: Annotated[Literal["Public", "Private"], Field(description="实验室的类型")]
    discipline: Annotated[
        Literal["Chemistry", "Biology"], Field(description="实验室的学科类型")
    ]
    mcp_tools_available: Annotated[
        list[str], Field(description="实验室可以使用的MCP工具列表")
    ] = []

    def add_mcp_tool(
        self,
        MCPTool: Annotated[MCPTool | None, Field(description="MCP工具的实例")] = None,
    ):  # 添加MCP工具
        if MCPTool is None:
            raise ValueError("必须提供MCP工具的实例")
        elif MCPTool.requires_license:
            raise ValueError("添加该MCP工具需要权限")
        else:
            if MCPTool not in self.mcp_tools_available:
                self.mcp_tools_available.append(MCPTool.tool_id)
            self.save_labs()

    def remove_mcp_tool(
        self,
        MCPTool: Annotated[MCPTool | None, Field(description="MCP工具的实例")] = None,
    ):  # 删除MCP工具
        if MCPTool is None:
            raise ValueError("必须提供MCP工具的实例")
        elif MCPTool.requires_license:
            raise ValueError("删除该MCP工具需要权限")
        else:
            if MCPTool in self.mcp_tools_available:
                self.mcp_tools_available.remove(MCPTool.tool_id)
            self.save_labs()

    @classmethod
    def from_lid(
        cls, lid: Annotated[int | None, Field(description="实验室的Lab ID")]
    ) -> "Lab":  # 从Lab ID获取实验室实例
        data_path = Path(__file__).parent.parent / "data" / "labs.json"
        with open(data_path, "r", encoding="utf-8") as f:
            labs_data = json.load(f)
        for lab_data in labs_data:
            if lab_data["lid"] == lid:
                return cls(**lab_data)
        raise ValueError(
            f"未找到lid为{lid}的实验室，可用ID: {set(x['lid'] for x in labs_data)}"
        )
        return None

    def save_labs(self) -> None:  # 追加保存实验室实例
        data_path = Path(__file__).parent.parent / "data" / "labs.json"
        # 读取现有数据
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            existing_data = []

        # 追加新数据
        existing_data.append(self.model_dump(mode="json"))

        # 写入文件
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=4)
        print(f"已追加保存实验室实例: {self.model_dump()}")
