import base64
import json
from typing import Any

from pydantic import BaseModel, Field, SecretStr, computed_field

from schemas.provider import ProviderType


class LLMConfig(BaseModel):
    provider: ProviderType = Field(default=ProviderType.AZURE_OPENAI, description="Provider type")
    key: SecretStr = Field(default=SecretStr(""), description="API Key")
    api: str = Field(default="", validation_alias="endpoint", description="API Endpoint (Base URL)")
    model: str = Field(
        default="gpt-4o", validation_alias="deployment", description="Model name or Azure Deployment name"
    )
    api_version: str | None = Field(
        default=None, validation_alias="version", description="API Version (Azure specific)"
    )
    timeout: int = Field(default=60, description="Request timeout")
    max_tokens: int = Field(default=4096, description="Max tokens")
    temperature: float = Field(default=0.7, description="Temperature")

    @computed_field
    @property
    def is_enabled(self) -> bool:
        if not self.key.get_secret_value():
            return False

        if self.provider == ProviderType.AZURE_OPENAI and not self.api:
            return False

        return True

    def to_extra_data(self) -> dict[str, Any]:
        config_json = {}

        if self.provider == ProviderType.AZURE_OPENAI:
            if self.api_version:
                config_json["azure_version"] = self.api_version
            config_json["azure_deployment"] = self.model
            config_json["azure_endpoint"] = self.api

        elif self.provider == ProviderType.GOOGLE_VERTEX:
            raw_key = self.key.get_secret_value()
            if raw_key:
                vertex_sa = json.loads(base64.b64decode(raw_key).decode("utf-8"))
                config_json["vertex_sa"] = vertex_sa

        return config_json
