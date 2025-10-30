from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, computed_field

from schemas.providers import ProviderType


class LLMConfig(BaseModel):
    """
    LLM configuration that maps cleanly to Provider model.
    Supports old-style environment variables with smart inference.
    """

    key: str = Field(default="", description="LLM API Key")
    api: str = Field(default="", description="LLM API Endpoint", alias="endpoint")
    model: str = Field(default="gpt-4o", description="Default LLM Model", alias="deployment")
    version: str = Field(default="2024-10-21", description="API Version (Azure specific)")
    timeout: int = Field(default=60, description="Request timeout in seconds")
    max_tokens: int = Field(default=4096, description="Maximum tokens")
    temperature: float = Field(default=0.7, description="Sampling temperature")

    @computed_field
    @property
    def provider_type(self) -> ProviderType:
        """Auto-detect provider type from endpoint URL."""
        if not self.api:
            return ProviderType.AZURE_OPENAI

        api_lower = self.api.lower()
        if "openai.azure.com" in api_lower:
            return ProviderType.AZURE_OPENAI
        elif "api.openai.com" in api_lower:
            return ProviderType.OPENAI
        elif "api.anthropic.com" in api_lower:
            return ProviderType.ANTHROPIC
        elif "generativelanguage.googleapis.com" in api_lower:
            return ProviderType.GOOGLE
        else:
            return ProviderType.AZURE_OPENAI

    @computed_field
    @property
    def is_enabled(self) -> bool:
        """Check if configuration is valid."""
        return bool(self.key and self.api and self.model)

    def to_provider_data(self, user_id: Optional[str] = None, name: str = "System Default") -> Dict[str, Any]:
        """Convert to Provider model data."""
        return {
            "user_id": user_id,
            "name": name,
            "provider_type": self.provider_type.value,
            "api": self.api,
            "key": self.key,
            "model": self.model,
            "timeout": self.timeout,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "is_system": True,
        }
