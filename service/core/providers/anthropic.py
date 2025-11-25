"""
Anthropic LLM Provider implementation.
Uses LangChain's ChatAnthropic to interact with Claude models.
"""

import logging
from typing import Any, Dict, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel

from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class AnthropicConfig(BaseModel):
    """Configuration for Anthropic provider."""

    base_url: Optional[str] = None


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic provider implementation using LangChain.
    """

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "anthropic"

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain ChatAnthropic model instance.

        Returns:
            ChatAnthropic instance ready for use with LangChain
        """
        # Parse provider-specific config
        config_data = self.config or {}
        anthropic_config = AnthropicConfig(**config_data)

        # Base parameters
        langchain_params: Dict[str, Any] = {
            "api_key": self.api_key,
            "model_name": self.model,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Handle Base URL
        if anthropic_config.base_url or self.api_endpoint:
            langchain_params["base_url"] = anthropic_config.base_url or self.api_endpoint

        # Handle Temperature
        if self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        # Handle Max Tokens
        if self.max_tokens is not None:
            langchain_params["max_tokens"] = self.max_tokens

        logger.debug(f"Initializing ChatAnthropic for {self.model}")

        return ChatAnthropic(**langchain_params)
