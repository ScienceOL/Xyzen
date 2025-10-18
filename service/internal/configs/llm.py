from pydantic import BaseModel, Field

from schemas.providers import ProviderType


class LLMConfig(BaseModel):
    """
    LLM configuration for the default Google Gemini provider.
    Other LLM providers are managed through the database.
    """

    provider: ProviderType = Field(default=ProviderType.GOOGLE, description="Default LLM Provider")
    key: str = Field(default="", description="LLM API Key")
    endpoint: str = Field(default="", description="LLM API Endpoint or base_url")
    version: str = Field(default="2024-10-21", description="LLM API Version")
    deployment: str = Field(default="gemini-2.5-pro", description="Default LLM Model Name")

    @property
    def is_enabled(self) -> bool:
        """Check if the default Google Gemini provider is properly configured."""
        return bool(self.key and self.deployment)
