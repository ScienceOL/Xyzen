from pydantic import BaseModel, Field


class NovuConfig(BaseModel):
    """Novu Notification Service Configuration"""

    Enable: bool = Field(default=False, description="Enable Novu notification integration")
    ApiUrl: str = Field(
        default="http://localhost:3100",
        description="Self-hosted Novu API URL",
    )
    SecretKey: str = Field(default="", description="Novu API secret key")
    AppIdentifier: str = Field(default="", description="Novu application identifier for frontend SDK")
