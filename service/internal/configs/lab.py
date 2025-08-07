from pydantic import BaseModel, Field


class LabConfig(BaseModel):
    """实验室API配置"""

    Api: str = Field(default="", description="实验室API基础URL")
    Key: str = Field(default="", description="API访问密钥")
    Timeout: int = Field(default=30, description="API请求超时时间(秒)")
