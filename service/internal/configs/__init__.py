# 导入Pydantic的Field类，用于定义配置字段的验证和元数据
from pydantic import Field
# 导入Pydantic Settings的基础类和配置字典类，用于创建配置管理类
from pydantic_settings import BaseSettings, SettingsConfigDict

# 导入实验室配置类
from internal.configs.lab import LabConfig

# 导入认证配置类和日志配置类
from .auth import AuthConfig
from .logger import LoggerConfig


# 定义应用配置类，继承自BaseSettings，提供环境变量和配置文件支持
class AppConfig(BaseSettings):
    # 配置模型的行为，定义如何从环境变量和配置文件读取配置
    model_config = SettingsConfigDict(
        env_prefix="XYZEN_",           # 环境变量前缀，所有环境变量必须以XYZEN_开头
        env_nested_delimiter="_",      # 嵌套配置的分隔符，如XYZEN_LOGGER_LEVEL
        case_sensitive=False,          # 环境变量不区分大小写
        env_file=".env",              # 从.env文件读取配置
        env_file_encoding="utf-8",    # .env文件的编码格式
        extra="forbid",               # 禁止额外的字段，如果环境变量中有未定义的字段会报错
    )

    # 基础应用信息配置
    Title: str = Field(default="Xyzen Service", description="应用标题")
    Description: str = Field(default="FastAPI + MCP integrated service", description="应用描述")
    Version: str = Field(default="0.1.0", description="应用版本")

    # 环境和调试设置
    SecretKey: str = Field(
        default=r"please$#@change&%me*in!production#2024@xyzen%secret^key",
        description="应用的密钥，用于加密和签名。生产环境中必须修改此默认值！",
    )
    Env: str = Field(default=r"dev", description="环境")
    Debug: bool = Field(default=True, description="调试模式")
    Host: str = Field(default="localhost", description="服务器主机")
    Port: int = Field(default=48200, description="服务器端口")
    Workers: int = Field(default=1, description="Gunicorn 工作进程数")

    # 日志配置，使用嵌套的LoggerConfig类
    Logger: LoggerConfig = Field(
        default_factory=lambda: LoggerConfig(),  # 使用工厂函数创建默认实例
        description="日志配置",
    )

    # 认证配置，使用嵌套的AuthConfig类
    Auth: AuthConfig = Field(
        default_factory=lambda: AuthConfig(),    # 使用工厂函数创建默认实例
        description="认证配置",
    )

    # 实验室API配置，使用嵌套的LabConfig类
    Lab: LabConfig = Field(
        default_factory=lambda: LabConfig(),     # 使用工厂函数创建默认实例
        description="实验室API配置",
    )


# 创建全局配置实例，这个实例会在模块导入时自动创建
configs: AppConfig = AppConfig()

# 定义模块的公共接口，只导出configs实例
__all__ = ["configs"]
