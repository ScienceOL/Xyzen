from pydantic import BaseModel, Field


class DifyConfig(BaseModel):
    """Dify API配置"""

    DifyApi: str = Field(default="https://dify1.dp.tech/v1", description="Dify API基础URL")
    DifyKey1: str = Field(default="app-zhUaiRh65uzYXkpY8tPL8Iza", description="生物Dify API访问密钥")
    DifyKey2: str = Field(default="app-e3Rk9fdW1otNzXJoRqyHE1KA", description="有机Dify API访问密钥")
    Timeout: int = Field(default=150, description="API请求超时时间(秒)")
