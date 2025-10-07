from pydantic import BaseModel, Field


class DynamicMCPConfig(BaseModel):
    """Dynamic MCP Server配置"""

    name: str = Field(default="DynamicMCPServer", description="Dynamic MCP Server名称")
    version: str = Field(default="1.0.0", description="Dynamic MCP Server版本")
    host: str = Field(default="0.0.0.0", description="Dynamic MCP Server主机")
    port: int = Field(default=3001, description="Dynamic MCP Server端口")
    cpu_count: int = Field(default=1, description="Sandbox 使用的CPU核心数")
    mem_limit: str = Field(default="256m", description="Sandbox 使用的内存限制")
    default_timeout: float = Field(default=30.0, description="Sandbox 默认超时时间")

    playwright_port: int = Field(default=8931, description="Playwright MCP Server端口")
    transport: str = Field(default="sse", description="Dynamic MCP Server传输协议")
    allowed_paths: list[str] = Field(default=["tools"], description="Dynamic MCP Server允许的路径")
