from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from internal.configs.lab import LabConfig

from .auth import AuthConfig
from .logger import LoggerConfig


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="XYZEN_",
        env_nested_delimiter="_",
        case_sensitive=False,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="forbid",
    )

    # Basic Application Information
    Title: str = Field(default="Xyzen Service", description="应用标题")
    Description: str = Field(default="FastAPI + MCP integrated service", description="应用描述")
    Version: str = Field(default="0.1.0", description="应用版本")

    # Environment and Debug Settings
    SecretKey: str = Field(
        default=r"please$#@change&%me*in!production#2024@xyzen%secret^key",
        description="应用的密钥，用于加密和签名。生产环境中必须修改此默认值！",
    )
    Env: str = Field(default=r"dev", description="环境")
    Debug: bool = Field(default=True, description="调试模式")
    Host: str = Field(default="localhost", description="服务器主机")
    Port: int = Field(default=48200, description="服务器端口")
    Workers: int = Field(default=1, description="Gunicorn 工作进程数")

    Logger: LoggerConfig = Field(
        default_factory=lambda: LoggerConfig(),
        description="日志配置",
    )

    Auth: AuthConfig = Field(
        default_factory=lambda: AuthConfig(),
        description="认证配置",
    )

    Lab: LabConfig = Field(
        default_factory=lambda: LabConfig(),
        description="实验室API配置",
    )


configs: AppConfig = AppConfig()

__all__ = ["configs"]
