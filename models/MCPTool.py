from pydantic import BaseModel, Field
from typing import Annotated, Literal


class MCPTool(BaseModel):
    # MCPTool基础信息
    name: Annotated[str | None, Field(description="MCPTool的名称")]
    version: Annotated[str | None, Field(description="MCPTool的版本")]
    download_url: Annotated[str | None, Field(description="MCPTool的下载地址")]
    description: Annotated[str | None, Field(description="MCPTool的描述")]
    # MCPTool实验室管理参数信息
    tid: Annotated[int | None, Field(description="MCPTool的Tool ID")]
    type: Annotated[
        Literal["Resources", "Tools", "Prompts"], Field(description="MCPTools的类型")
    ]
    # MCPTool的内部参数
    parameters: Annotated[dict, Field(description="MCPTool的参数")]
    requires_license: Annotated[bool, Field(description="操作是否需要权限")] = True
