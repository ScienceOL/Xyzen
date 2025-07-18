from pydantic import BaseModel, Field


class AIServerProvider(BaseModel):
    """AI服务器提供者配置"""

    Name: str = Field(default="", description="提供者名称")
    Api: str = Field(default="", description="API基础URL")
    Key: str = Field(default="", description="API访问密钥")
    Timeout: int = Field(default=10, description="API请求超时时间(秒)")
    Model: str = Field(default="", description="默认模型名称")
    MaxTokens: int = Field(default=4096, description="最大令牌数")
    Temperature: float = Field(default=0.7, description="生成温度")
