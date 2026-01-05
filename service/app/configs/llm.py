import base64
import json
from typing import Any

from pydantic import BaseModel, Field, SecretStr

from app.schemas.provider import ProviderType


class LLMProviderConfig(BaseModel):
    """Single-provider LLM config (used under multi-provider wrapper)."""

    key: SecretStr = Field(default=SecretStr(""), description="API Key")
    api: str = Field(default="", validation_alias="endpoint", description="API Endpoint (Base URL)")
    model: str = Field(
        default="gpt-4o", validation_alias="deployment", description="Model name or Azure Deployment name"
    )
    api_version: str | None = Field(
        default=None, validation_alias="version", description="API Version (Azure specific)"
    )
    project: str | None = Field(default=None, description="Project name or Google Cloud Project ID")
    timeout: int = Field(default=60, description="Request timeout")
    max_tokens: int = Field(default=4096, description="Max tokens")
    temperature: float = Field(default=0.7, description="Temperature")

    def is_enabled_for(self, provider: ProviderType) -> bool:
        if not self.key.get_secret_value():
            return False

        if provider == ProviderType.AZURE_OPENAI and not self.api:
            return False

        if provider == ProviderType.GOOGLE_VERTEX and not self.project:
            return False

        return True

    def to_extra_data(self, provider: ProviderType) -> dict[str, Any]:
        config_json: dict[str, Any] = {}

        if provider == ProviderType.AZURE_OPENAI:
            if self.api_version:
                config_json["azure_version"] = self.api_version
            config_json["azure_deployment"] = self.model
            config_json["azure_endpoint"] = self.api

        elif provider == ProviderType.GOOGLE_VERTEX:
            raw_key = self.key.get_secret_value()
            if raw_key:
                vertex_sa = json.loads(base64.b64decode(raw_key).decode("utf-8"))
                config_json["vertex_sa"] = vertex_sa
                config_json["vertex_project"] = self.project

        return config_json


class LLMConfig(BaseModel):
    """LLM configuration supporting multiple providers.

    New env format:
      - XYZEN_LLM_PROVIDERS=azure_openai,google_vertex
      - XYZEN_LLM_AZUREOPENAI_KEY=...
      - XYZEN_LLM_AZUREOPENAI_ENDPOINT=...
      - XYZEN_LLM_AZUREOPENAI_VERSION=...
      - XYZEN_LLM_AZUREOPENAI_DEPLOYMENT=...
      - XYZEN_LLM_GOOGLEVERTEX_KEY=... (base64 service account JSON)
      - XYZEN_LLM_GOOGLEVERTEX_PROJECT=...
      - XYZEN_LLM_GOOGLEVERTEX_DEPLOYMENT=gemini-...

    Backward compatible with legacy single-provider env:
      - XYZEN_LLM_PROVIDER, XYZEN_LLM_KEY, XYZEN_LLM_ENDPOINT, XYZEN_LLM_VERSION, XYZEN_LLM_DEPLOYMENT
    """

    # NOTE: Keep as `str` to avoid pydantic-settings attempting JSON decoding for nested list fields.
    # We parse the CSV ourselves in `iter_enabled()`.
    providers: str = Field(default="", description="Enabled provider list (comma-separated)")

    # Per-provider configs (env: XYZEN_LLM_<PROVIDERSEG>_<FIELD>)
    azureopenai: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="Azure OpenAI config")
    openai: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="OpenAI config")
    google: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="Google GenAI config")
    googlevertex: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="Google Vertex config")
    gpugeek: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="GPUGeek config")
    qwen: LLMProviderConfig = Field(default_factory=LLMProviderConfig, description="Qwen config")

    # Legacy single-provider fields
    provider: ProviderType | None = Field(default=None, description="(Legacy) Provider type")
    key: SecretStr = Field(default=SecretStr(""), description="(Legacy) API Key")
    api: str = Field(default="", validation_alias="endpoint", description="(Legacy) API Endpoint (Base URL)")
    model: str = Field(
        default="gpt-4o", validation_alias="deployment", description="(Legacy) Model name or Azure Deployment name"
    )
    api_version: str | None = Field(
        default=None, validation_alias="version", description="(Legacy) API Version (Azure specific)"
    )
    project: str | None = Field(default=None, description="(Legacy) Project name or Google Cloud Project ID")
    timeout: int = Field(default=60, description="(Legacy) Request timeout")
    max_tokens: int = Field(default=4096, description="(Legacy) Max tokens")
    temperature: float = Field(default=0.7, description="(Legacy) Temperature")

    def _parsed_providers(self) -> list[ProviderType]:
        raw = (self.providers or "").strip()
        if not raw:
            return []

        items = [p.strip() for p in raw.split(",") if p.strip()]

        def normalize(s: str) -> str:
            s = s.strip().lower()
            s = s.replace("-", "_")
            s = s.replace(" ", "")
            if s == "azureopenai":
                return ProviderType.AZURE_OPENAI.value
            if s == "googlevertex":
                return ProviderType.GOOGLE_VERTEX.value
            if s == "gpugeek":
                return ProviderType.GPUGEEK.value
            if s == "qwen":
                return ProviderType.QWEN.value
            return s

        return [ProviderType(normalize(item)) for item in items]

    def _legacy_as_provider_config(self) -> tuple[ProviderType, LLMProviderConfig] | None:
        if not self.provider:
            return None
        legacy = LLMProviderConfig(
            key=self.key,
            api=self.api,
            model=self.model,
            api_version=self.api_version,
            project=self.project,
            timeout=self.timeout,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )
        return (self.provider, legacy)

    def get_provider_config(self, provider: ProviderType) -> LLMProviderConfig:
        match provider:
            case ProviderType.AZURE_OPENAI:
                return self.azureopenai
            case ProviderType.OPENAI:
                return self.openai
            case ProviderType.GOOGLE:
                return self.google
            case ProviderType.GOOGLE_VERTEX:
                return self.googlevertex
            case ProviderType.GPUGEEK:
                return self.gpugeek
            case ProviderType.QWEN:
                return self.qwen

    def iter_enabled(self) -> list[tuple[ProviderType, LLMProviderConfig]]:
        """Return enabled provider configs.

        Priority:
          1) If providers list is set, use it.
          2) Else fall back to legacy single-provider config.
        """
        parsed = self._parsed_providers()
        if parsed:
            enabled: list[tuple[ProviderType, LLMProviderConfig]] = []
            for p in parsed:
                cfg = self.get_provider_config(p)
                if cfg.is_enabled_for(p):
                    enabled.append((p, cfg))
            return enabled

        legacy = self._legacy_as_provider_config()
        if legacy and legacy[1].is_enabled_for(legacy[0]):
            return [legacy]

        return []

    @property
    def is_enabled(self) -> bool:
        return len(self.iter_enabled()) > 0

    @property
    def default_provider(self) -> ProviderType | None:
        enabled = self.iter_enabled()
        return enabled[0][0] if enabled else None

    @property
    def default_config(self) -> LLMProviderConfig | None:
        enabled = self.iter_enabled()
        return enabled[0][1] if enabled else None
