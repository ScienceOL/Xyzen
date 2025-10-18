from enum import Enum


class ProviderType(Enum):
    """Enumeration of available LLM provider types."""

    OPENAI = "openai"
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
