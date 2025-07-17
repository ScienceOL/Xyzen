from typing import Optional

from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    Host: str = Field(default="127.0.0.1", description="服务器主机")
    Port: int = Field(default=48200, description="服务器端口")
    Reload: bool = Field(default=True, description="是否启用热重载")


class MCPConfig(BaseModel):
    Debug: bool = Field(default=True, description="MCP 调试模式")
    StreamableHttpPath: str = Field(default="/", description="MCP HTTP 路径")
    Timeout: int = Field(default=30, description="MCP 超时时间(秒)")


class LoggingConfig(BaseModel):
    Level: str = Field(default="debug", description="日志级别")
    Format: str = Field(default="%(asctime)s - %(name)s - %(levelname)s - %(message)s", description="日志格式")
    FileEnabled: bool = Field(default=False, description="是否启用文件日志")
    File_Path: Optional[str] = Field(default=None, description="日志文件路径")


class AuthConfig(BaseModel):
    Enabled: bool = Field(default=True, description="是否启用认证")
    CasdoorEndpoint: str = Field(default="http://localhost:8000", description="Casdoor 端点")
    Organization: str = Field(default="built-in", description="Casdoor 组织")
    Application: str = Field(default="app-built-in", description="Casdoor 应用")


class LabConfig(BaseModel):
    """实验室API配置"""
    ApiBaseUrl: str = Field(default="https://uni-lab.test.bohrium.com", description="实验室API基础URL")
    SecretKey: str = Field(default="66A22BE1", description="API访问密钥")
    Timeout: int = Field(default=10, description="API请求超时时间(秒)")


class AppConfig(BaseModel):
    Env: str = Field(default="dev", description="环境")
    Debug: bool = Field(default=True, description="调试模式")
    Title: str = Field(default="Xyzen Service", description="应用标题")
    Description: str = Field(default="FastAPI + MCP integrated service", description="应用描述")
    Version: str = Field(default="0.1.0", description="应用版本")

    SERVER: ServerConfig = Field(default_factory=ServerConfig)
    MCP: MCPConfig = Field(default_factory=MCPConfig)
    LOGGING: LoggingConfig = Field(default_factory=LoggingConfig)
    AUTH: AuthConfig = Field(default_factory=AuthConfig)
    LAB: LabConfig = Field(default_factory=LabConfig)
