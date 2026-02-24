"""Airwallex payment gateway configuration."""

from pydantic import Field
from pydantic_settings import BaseSettings


class AirwallexConfig(BaseSettings):
    Enabled: bool = Field(default=False, description="Enable Airwallex payment gateway")
    ClientId: str = Field(default="", description="Airwallex API client ID")
    ApiKey: str = Field(default="", description="Airwallex API key")
    WebhookSecret: str = Field(default="", description="Airwallex webhook signing secret")
    BaseUrl: str = Field(
        default="https://api-demo.airwallex.com",
        description="Airwallex API base URL (use https://api.airwallex.com for production)",
    )
