"""
Base LLM Provider abstract class.
Defines the interface that all LLM providers must implement using LangChain.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, List, Optional

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, SecretStr

from .config_manager import ModelConfig, ModelConfigManager

logger = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# DTOs (Data Transfer Objects)
# Kept for compatibility with existing API signatures and schemas.
# -----------------------------------------------------------------------------


class ChatMessage(BaseModel):
    """Standardized chat message format."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Standardized chat completion request format."""

    messages: List[ChatMessage]
    model: str
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    tools: Optional[List[dict[str, Any]]] = None
    tool_choice: Optional[str] = None


class ChatCompletionResponse(BaseModel):
    """Standardized chat completion response format."""

    content: Optional[str]
    tool_calls: Optional[List[dict[str, Any]]] = None
    finish_reason: Optional[str] = None
    usage: Optional[dict[str, Any]] = None


# -----------------------------------------------------------------------------
# Base Provider Class
# -----------------------------------------------------------------------------


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.

    This class defines the interface for creating LangChain Chat Models.
    Direct API calls (chat_completion) are deprecated in favor of to_langchain_model.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        timeout: int = 120,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the provider configuration.

        Args:
            api_key: The API key for authentication
            api_endpoint: The API endpoint URL
            model: The default model name
            max_tokens: User-defined override for max tokens (if None, uses model config)
            temperature: User-defined override for temperature
            timeout: Request timeout in seconds
            **kwargs: Additional provider-specific configuration
        """
        self.api_key = api_key
        self.api_endpoint = api_endpoint
        self.model = model or "gpt-4o"
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.timeout = timeout
        self.config = kwargs

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Get the name of the provider (e.g. 'openai', 'google').
        """
        pass

    @property
    def supported_models(self) -> List[str]:
        """
        Get the list of supported models for this provider from config.
        """
        return ModelConfigManager.get_supported_models(self.provider_name)

    def _get_config(self) -> Optional[ModelConfig]:
        """
        Get the capabilities and configuration for the current model.
        """
        return ModelConfigManager.get_model_config(self.provider_name, self.model)

    @abstractmethod
    def to_langchain_model(self) -> BaseChatModel:
        """
        Create and configure a LangChain Chat Model instance.

        This is the primary method that should be used to interact with the LLM.
        The returned model should be configured with:
        - API credentials
        - Model parameters (temperature, max_tokens) based on capabilities
        - Timeout settings

        Returns:
            BaseChatModel: A configured LangChain chat model.
        """
        pass

    def is_available(self) -> bool:
        """
        Check if the provider is properly configured (has API key).
        """
        try:
            return bool(self.api_key) and bool(self.api_key.get_secret_value())
        except Exception:
            return False
