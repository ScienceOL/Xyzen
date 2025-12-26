from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class McpProviderConfigBase(BaseModel):
    """MCP 提供者配置基类 - 统一所有 MCP 提供者的配置接口"""

    Name: str = Field(
        default="",
        description="MCP 提供者名称",
    )
    Key: str = Field(
        default="",
        description="MCP 提供者的访问密钥或 API 密钥",
    )


class SmitheryMcpConfig(McpProviderConfigBase):
    """Smithery MCP 提供者配置"""

    Name: str = Field(
        default="smithery",
        description="MCP 提供者名称，固定为 'smithery'",
    )
    Key: str = Field(
        default="",
        description="Smithery API 密钥",
    )


class McpProviderConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="forbid",
    )

    Enabled: bool = Field(default=True, description="是否启用 MCP 提供者")

    Smithery: SmitheryMcpConfig = Field(
        default_factory=lambda: SmitheryMcpConfig(),
        description="Smithery MCP 提供者配置",
    )
