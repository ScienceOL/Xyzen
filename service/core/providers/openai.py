"""
OpenAI LLM Provider implementation.
Standard OpenAI API support (use AzureOpenAIProvider for Azure).
"""

import logging
from typing import Any, List, Optional

from openai import AsyncOpenAI

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """
    Standard OpenAI provider implementation.
    For Azure OpenAI, use AzureOpenAIProvider instead.
    """

    def __init__(
        self,
        api_key: str,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: int = 60,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the OpenAI provider.

        Args:
            api_key: The API key for authentication
            api_endpoint: API endpoint URL (defaults to OpenAI's official endpoint)
            model: The default model name
            max_tokens: Maximum tokens for responses
            temperature: Sampling temperature
            timeout: Request timeout in seconds
            **kwargs: Additional configuration
        """
        super().__init__(
            api_key=api_key,
            api_endpoint=api_endpoint,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout,
            **kwargs,
        )

        # Initialize OpenAI client
        logger.info(f"Initializing OpenAI client with endpoint: {api_endpoint or 'default'}")
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.api_endpoint,
            timeout=self.timeout,
        )

        # Mark as supporting streaming
        self._streaming_supported = True

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using OpenAI API.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        raise NotImplementedError("Switch to langchain-based implementation for chat_completion.")

    def is_available(self) -> bool:
        """
        Check if the provider is properly configured and available.

        Returns:
            True if the provider is available, False otherwise
        """
        try:
            return bool(self.api_key)
        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        """
        Get the name of the provider.

        Returns:
            The provider name
        """
        return "openai"

    @property
    def supported_models(self) -> List[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        return [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
            "o1-preview",
            "o1-mini",
        ]
