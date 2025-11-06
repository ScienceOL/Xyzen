"""
Base LLM Provider abstract class.
Defines the interface that all LLM providers must implement.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, SecretStr

logger = logging.getLogger(__name__)


@dataclass
class ModelCapabilities:
    """Defines the capabilities supported by a specific model."""

    supports_temperature: bool = True
    supports_max_tokens: bool = True
    supports_tools: bool = True
    supports_streaming: bool = True
    supports_system_messages: bool = True


class ModelRegistry:
    """Registry of model capabilities across all providers."""

    _capabilities: Dict[str, ModelCapabilities] = {
        # OpenAI models
        "gpt-4o": ModelCapabilities(),
        "gpt-4o-mini": ModelCapabilities(),
        "gpt-4-turbo": ModelCapabilities(),
        "gpt-4": ModelCapabilities(),
        "gpt-3.5-turbo": ModelCapabilities(),
        "gpt-3.5-turbo-16k": ModelCapabilities(),
        # OpenAI reasoning models (no temperature/max_tokens)
        "o1-preview": ModelCapabilities(supports_temperature=False, supports_max_tokens=False),
        "o1-mini": ModelCapabilities(supports_temperature=False, supports_max_tokens=False),
        # Future GPT-5 (based on user's issue)
        "gpt-5": ModelCapabilities(supports_temperature=False, supports_max_tokens=False),
        # Anthropic models
        "claude-3-5-sonnet-20241022": ModelCapabilities(),
        "claude-3-5-haiku-20241022": ModelCapabilities(),
        "claude-3-opus-20240229": ModelCapabilities(),
        "claude-3-sonnet-20240229": ModelCapabilities(),
        "claude-3-haiku-20240307": ModelCapabilities(),
        # Google models
        "gemini-1.5-pro": ModelCapabilities(),
        "gemini-1.5-flash": ModelCapabilities(),
        "gemini-pro": ModelCapabilities(),
    }

    @classmethod
    def get_capabilities(cls, model: str) -> ModelCapabilities:
        """Get capabilities for a model, with fallback to default."""
        return cls._capabilities.get(model, ModelCapabilities())

    @classmethod
    def register_model(cls, model: str, capabilities: ModelCapabilities) -> None:
        """Register a new model with its capabilities."""
        cls._capabilities[model] = capabilities
        logger.info(f"Registered model {model} with capabilities: {capabilities}")

    @classmethod
    def list_models(cls) -> list[str]:
        """List all registered models."""
        return list(cls._capabilities.keys())


class ChatMessage(BaseModel):
    """Standardized chat message format."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Standardized chat completion request format with truly optional parameters."""

    messages: list[ChatMessage]
    model: str
    temperature: float | None = None  # Truly optional, no default
    max_tokens: int | None = None  # Truly optional, no default
    tools: list[Dict[str, Any]] | None = None
    tool_choice: str | None = None


class ChatCompletionStreamChunk(BaseModel):
    """Standardized chat completion stream chunk format."""

    content: str | None = None
    finish_reason: str | None = None
    usage: Dict[str, Any] | None = None


class ChatCompletionResponse(BaseModel):
    """Standardized chat completion response format."""

    content: str | None
    tool_calls: list[Dict[str, Any]] | None = None
    finish_reason: str | None = None
    usage: Dict[str, Any] | None = None


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.

    This class defines the interface that all LLM providers must implement
    to ensure consistent behavior across different providers.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 120,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the provider with configuration matching SQLModel schema.
        Parameters are now truly optional to support model-specific capabilities.

        Args:
            api_key: The API key for authentication (maps to 'key' in DB)
            api_endpoint: The API endpoint URL (maps to 'api' in DB)
            model: The default model name
            max_tokens: Maximum tokens for responses (optional)
            temperature: Sampling temperature (optional)
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

    def get_model_capabilities(self, model: str) -> ModelCapabilities:
        """Get capabilities for a specific model."""
        return ModelRegistry.get_capabilities(model)

    def build_api_params(self, request: ChatCompletionRequest) -> Dict[str, Any]:
        """
        Build API parameters filtered by model capabilities.

        Args:
            request: The chat completion request

        Returns:
            Dictionary of API parameters filtered for the model
        """
        capabilities = self.get_model_capabilities(request.model)

        # Start with required parameters
        params: Dict[str, Any] = {
            "model": request.model,
            "messages": self._convert_messages(request.messages),
        }

        # Add optional parameters based on capabilities and request values
        if capabilities.supports_temperature and request.temperature is not None:
            params["temperature"] = request.temperature
        elif capabilities.supports_temperature and self.temperature is not None:
            # Fallback to provider default if request doesn't specify
            params["temperature"] = self.temperature

        if capabilities.supports_max_tokens and request.max_tokens is not None:
            params["max_tokens"] = request.max_tokens
        elif capabilities.supports_max_tokens and self.max_tokens is not None:
            # Fallback to provider default if request doesn't specify
            params["max_tokens"] = self.max_tokens

        if capabilities.supports_tools and request.tools:
            params["tools"] = request.tools
            if request.tool_choice:
                params["tool_choice"] = request.tool_choice

        # Log filtered parameters for debugging
        filtered_out = []
        if not capabilities.supports_temperature and (request.temperature is not None or self.temperature is not None):
            filtered_out.append("temperature")
        if not capabilities.supports_max_tokens and (request.max_tokens is not None or self.max_tokens is not None):
            filtered_out.append("max_tokens")
        if not capabilities.supports_tools and request.tools:
            filtered_out.append("tools")

        if filtered_out:
            logger.info(f"Filtered out unsupported parameters for {request.model}: {filtered_out}")

        return params

    @abstractmethod
    def _convert_messages(self, messages: list[ChatMessage]) -> Any:
        """
        Convert standard messages to provider-specific format.

        Args:
            messages: List of standard chat messages

        Returns:
            Provider-specific message format
        """
        pass

    @abstractmethod
    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        pass

    # async def chat_completion_stream(
    #     self, request: ChatCompletionRequest
    # ) -> AsyncGenerator[ChatCompletionStreamChunk, None]:
    #     """
    #     Generate a streaming chat completion.

    #     Args:
    #         request: The chat completion request

    #     Yields:
    #         Stream chunks of the completion response
    #     """
    #     # Default implementation falls back to regular completion
    #     response = await self.chat_completion(request)
    #     if response.content:
    #         yield ChatCompletionStreamChunk(content=response.content, finish_reason=response.finish_reason)

    def supports_streaming(self) -> bool:
        """
        Check if the provider supports streaming.

        Returns:
            True if streaming is supported, False otherwise
        """
        # Subclasses should override this if they support streaming
        return True

    @abstractmethod
    def is_available(self) -> bool:
        """
        Check if the provider is properly configured and available.

        Returns:
            True if the provider is available, False otherwise
        """
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Get the name of the provider.

        Returns:
            The provider name
        """
        pass

    @property
    @abstractmethod
    def supported_models(self) -> list[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        pass

    @abstractmethod
    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain model instance.

        Returns:
            BaseChatModel instance ready for use with LangChain
        """
        pass
