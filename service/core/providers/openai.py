"""
OpenAI LLM Provider implementation.
Uses LangChain's ChatOpenAI to interact with OpenAI models.
"""

import logging
from typing import Any, Dict, Optional

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    organization: Optional[str] = None
    base_url: Optional[str] = None


class OpenAIProvider(BaseLLMProvider):
    """
    Standard OpenAI provider implementation using LangChain.
    """

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "openai"

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain ChatOpenAI model instance.

        Returns:
            ChatOpenAI instance ready for use with LangChain
        """
        # Parse provider-specific config
        config_data = self.config or {}
        openai_config = OpenAIConfig(**config_data)

        # Get model capability config
        # model_config = self._get_config()
        is_o1_model = self.model.startswith("o1-")

        # Base parameters for ChatOpenAI
        langchain_params: Dict[str, Any] = {
            "api_key": self.api_key,
            "model": self.model,
            "timeout": self.timeout,
            # OpenAI supports streaming by default for most chat models
            # We enable it here, but individual invokes can override if needed
            "streaming": True,
        }

        # Handle Endpoint Configuration
        if openai_config.base_url or self.api_endpoint:
            langchain_params["base_url"] = openai_config.base_url or self.api_endpoint

        if openai_config.organization:
            langchain_params["organization"] = openai_config.organization

        # Handle Temperature
        # O1 models (reasoning models) currently do not support temperature
        # or require it to be fixed (often 1.0), so we filter it out for them
        # unless explicitly handled by the underlying lib updates.
        supports_temperature = not is_o1_model

        if supports_temperature and self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        # Handle Max Tokens
        # We prioritize user-provided max_tokens (self.max_tokens).
        # If not provided, we rely on LangChain/API defaults.
        # Note: O1 models use 'max_completion_tokens' instead of 'max_tokens'
        # but modern langchain-openai handles mapping if 'max_tokens' is passed,
        # or we can be explicit if needed.
        if self.max_tokens is not None:
            if is_o1_model:
                langchain_params["max_completion_tokens"] = self.max_tokens
            else:
                langchain_params["max_tokens"] = self.max_tokens

        # If model config defines a hard output limit and user didn't specify one,
        # we might optionally set it, but usually it's better to leave it open
        # unless we want to enforce cost controls.
        # Here we only set it if the user asked for it.

        logger.debug(
            f"Initializing ChatOpenAI for {self.model} "
            f"(base_url={langchain_params.get('base_url')}, is_o1={is_o1_model})"
        )

        return ChatOpenAI(**langchain_params)
