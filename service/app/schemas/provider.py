from enum import StrEnum
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, Field, SecretStr


class ProviderScope(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ORGANIZATION = "org"


class ProviderType(StrEnum):
    """Enumeration of available provider types."""

    OPENAI = "openai"
    AZURE_OPENAI = "azure_openai"
    GOOGLE = "google"
    GOOGLE_VERTEX = "google_vertex"
    GPUGEEK = "gpugeek"
    QWEN = "qwen"


class LLMCredentials(TypedDict):
    api_key: SecretStr
    api_endpoint: NotRequired[str]

    # Azure
    azure_endpoint: NotRequired[str]
    azure_version: NotRequired[str]
    azure_deployment: NotRequired[str]

    # Vertex
    vertex_sa: NotRequired[dict]
    vertex_project: NotRequired[str]


class RuntimeProviderConfig(BaseModel):
    name: str
    provider_scope: ProviderScope
    provider_type: ProviderType

    api_key: SecretStr
    api_endpoint: str | None = None

    model: str
    max_tokens: int | None = None
    temperature: float | None = None
    timeout: int | None = None

    extra_config: dict[str, Any] = Field(default_factory=dict)

    def to_credentials(self) -> LLMCredentials:
        creds: LLMCredentials = {"api_key": self.api_key}

        if self.api_endpoint:
            creds["api_endpoint"] = self.api_endpoint

        # Azure
        if "azure_endpoint" in self.extra_config:
            creds["azure_endpoint"] = self.extra_config["azure_endpoint"]
        if "azure_deployment" in self.extra_config:
            creds["azure_deployment"] = self.extra_config["azure_deployment"]
        if "azure_version" in self.extra_config:
            creds["azure_version"] = self.extra_config["azure_version"]

        # Vertex
        if "vertex_sa" in self.extra_config:
            creds["vertex_sa"] = self.extra_config["vertex_sa"]
        if "vertex_project" in self.extra_config:
            creds["vertex_project"] = self.extra_config["vertex_project"]

        return creds
