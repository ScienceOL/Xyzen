from enum import Enum
from typing import Any, Dict, List

from pydantic import BaseModel


class ProviderType(Enum):
    """Enumeration of available LLM provider types."""

    OPENAI = "openai"
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"


class ProviderTemplate(BaseModel):
    """Template for creating a provider with metadata for UI."""

    type: str
    display_name: str
    description: str
    required_fields: List[str]
    optional_fields: List[str]
    default_config: Dict[str, Any]


# Provider templates for the UI
PROVIDER_TEMPLATES = [
    ProviderTemplate(
        type="google",
        display_name="Google Gemini",
        description="Google's Gemini AI models with advanced reasoning capabilities",
        required_fields=["api_key", "model"],
        optional_fields=["base_url", "project", "location", "max_tokens", "temperature", "timeout"],
        default_config={
            "model": "gemini-2.0-flash-exp",
            "max_tokens": 8192,
            "temperature": 0.7,
            "timeout": 60,
        },
    ),
    ProviderTemplate(
        type="openai",
        display_name="OpenAI",
        description="OpenAI's GPT models including GPT-4 and GPT-3.5",
        required_fields=["api_key", "model"],
        optional_fields=["base_url", "max_tokens", "temperature", "timeout"],
        default_config={
            "model": "gpt-4o",
            "max_tokens": 4096,
            "temperature": 0.7,
            "timeout": 60,
        },
    ),
    ProviderTemplate(
        type="anthropic",
        display_name="Anthropic Claude",
        description="Anthropic's Claude models with extended context windows",
        required_fields=["api_key", "model"],
        optional_fields=["base_url", "max_tokens", "temperature", "timeout"],
        default_config={
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 4096,
            "temperature": 0.7,
            "timeout": 60,
        },
    ),
    ProviderTemplate(
        type="azure_openai",
        display_name="Azure OpenAI",
        description="Microsoft Azure's OpenAI Service with enterprise features",
        required_fields=["api_key", "api_endpoint", "deployment", "api_version"],
        optional_fields=["max_tokens", "temperature", "timeout"],
        default_config={
            "api_version": "2024-10-21",
            "max_tokens": 4096,
            "temperature": 0.7,
            "timeout": 60,
        },
    ),
]
