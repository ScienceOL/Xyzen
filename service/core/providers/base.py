"""
Base LLM Provider abstract class.
Defines the interface that all LLM providers must implement.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, SecretStr


class ChatMessage(BaseModel):
    """Standardized chat message format."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Standardized chat completion request format."""

    messages: List[ChatMessage]
    model: str
    temperature: float = 1.0
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

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: int = 60,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the provider with configuration matching SQLModel schema.

        Args:
            api_key: The API key for authentication (maps to 'key' in DB)
            api_endpoint: The API endpoint URL (maps to 'api' in DB)
            model: The default model name
            max_tokens: Maximum tokens for responses
            temperature: Sampling temperature
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
    def supported_models(self) -> List[str]:
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
