from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LoggerFileConfig(BaseModel):
    Enabled: bool = Field(default=False, description="是否启用文件日志")
    Path: str = Field(default="/var/log/xyzen.log", description="日志文件路径")


class LoggerConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",
    )

    Level: Literal["debug", "info", "warning", "error", "critical"] = Field(default="info", description="日志级别")

    File: LoggerFileConfig = Field(
        default_factory=lambda: LoggerFileConfig(),
        description="文件日志配置",
    )
