from pydantic import Field
from pydantic_settings import BaseSettings


class EEConfig(BaseSettings):
    """Enterprise Edition configuration.

    Environment variables:
        XYZEN_EE_Enabled     — enable EE mode (default: false)
        XYZEN_EE_ApiUrl      — remote EE API base URL
        XYZEN_EE_LicenseKey  — license key for EE API authentication
    """

    Enabled: bool = Field(default=False, description="Enable Enterprise Edition mode")
    ApiUrl: str = Field(default="", description="Remote EE API base URL")
    LicenseKey: str = Field(default="", description="License key for EE API authentication")
