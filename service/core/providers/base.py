"""
Base LLM Provider abstract class.
Defines the interface that all LLM providers must implement.
"""

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Standardized chat message format."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Standardized chat completion request format."""

    messages: List[ChatMessage]
    model: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[str] = None


class ChatCompletionStreamChunk(BaseModel):
    """Standardized chat completion stream chunk format."""

    content: Optional[str] = None
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


class ChatCompletionResponse(BaseModel):
    """Standardized chat completion response format."""

    content: Optional[str]
    tool_calls: Optional[List[Dict[str, Any]]] = None
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.

    This class defines the interface that all LLM providers must implement
    to ensure consistent behavior across different providers.
    """

    def __init__(self, api_key: str, base_url: Optional[str] = None, **kwargs: Any) -> None:
        """
        Initialize the provider with basic configuration.

        Args:
            api_key: The API key for authentication
            base_url: Optional base URL for the API endpoint
            **kwargs: Additional provider-specific configuration
                - default_model: The default model to use for this provider
                - max_tokens: Maximum tokens for responses
                - temperature: Sampling temperature
                - timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.base_url = base_url
        self.default_model = kwargs.get("default_model", "gpt-4o")
        self.max_tokens = kwargs.get("max_tokens", 4096)
        self.temperature = kwargs.get("temperature", 0.7)
        self.timeout = kwargs.get("timeout", 60)
        self.config = kwargs

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

    async def chat_completion_stream(
        self, request: ChatCompletionRequest
    ) -> AsyncGenerator[ChatCompletionStreamChunk, None]:
        """
        Generate a streaming chat completion.

        Args:
            request: The chat completion request

        Yields:
            Stream chunks of the completion response
        """
        # Default implementation falls back to regular completion
        response = await self.chat_completion(request)
        if response.content:
            yield ChatCompletionStreamChunk(content=response.content, finish_reason=response.finish_reason)

    def supports_streaming(self) -> bool:
        """
        Check if the provider supports streaming.

        Returns:
            True if streaming is supported, False otherwise
        """
        return hasattr(self, "_streaming_supported") and getattr(self, "_streaming_supported", False)

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
    def supported_models(self) -> List[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        pass
