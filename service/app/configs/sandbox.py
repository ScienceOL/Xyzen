"""
E2B 沙箱配置

E2B 云原生沙箱的配置项。
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class SandboxConfig(BaseSettings):
    """E2B 沙箱配置"""

    model_config = {"env_prefix": "SANDBOX_"}

    # E2B API 配置
    e2b_api_key: str = Field(
        default="",
        description="E2B API Key",
    )

    # 沙箱类型配置
    default_sandbox_type: str = Field(
        default="code_interpreter",
        description="默认沙箱类型: code_interpreter, custom",
    )

    custom_template_id: str = Field(
        default="",
        description="Custom Sandbox 的模板 ID（E2B 控制台创建）",
    )

    # 超时配置
    execution_timeout_secs: int = Field(
        default=300,  # 5 分钟
        description="单次代码执行超时（秒）",
    )

    sandbox_idle_timeout_secs: int = Field(
        default=1800,  # 30 分钟
        description="沙箱空闲超时，超时后自动关闭",
    )

    sandbox_max_lifetime_secs: int = Field(
        default=7200,  # 2 小时
        description="沙箱最大存活时间",
    )
