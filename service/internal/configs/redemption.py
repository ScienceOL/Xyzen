from pydantic import Field
from pydantic_settings import BaseSettings


class RedemptionConfig(BaseSettings):
    """Redemption code configuration"""

    secret: str = Field(
        default="change-this-admin-secret-key-in-production",
        description="Admin secret key for generating redemption codes. MUST be changed in production!",
    )
