from pydantic import BaseModel, Field


class AIServerProvider(BaseModel):
    """AI server provider configuration"""

    Name: str = Field(default="", description="Provider name")
    Api: str = Field(default="", description="API base URL")
    Key: str = Field(default="", description="API access key")
    Timeout: int = Field(default=10, description="API request timeout (seconds)")
    Model: str = Field(default="", description="Default model name")
    MaxTokens: int = Field(default=4096, description="Max token count")
    Temperature: float = Field(default=0.7, description="Generation temperature")
