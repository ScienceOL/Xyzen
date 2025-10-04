from pydantic import BaseModel, Field


class DynamicMCPConfig(BaseModel):
    """Dynamic MCP Server配置"""

    name: str = Field(default="DynamicMCPServer", description="Dynamic MCP Server名称")
    version: str = Field(default="1.0.0", description="Dynamic MCP Server版本")
    host: str = Field(default="0.0.0.0", description="Dynamic MCP Server主机")
    port: int = Field(default=3001, description="Dynamic MCP Server端口")
    playwright_port: int = Field(default=8931, description="Playwright MCP Server端口")
    transport: str = Field(default="sse", description="Dynamic MCP Server传输协议")
    allowed_paths: list[str] = Field(default=["tools"], description="Dynamic MCP Server允许的路径")
