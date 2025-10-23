"""
Azure OpenAI LLM Provider implementation.
Dedicated provider for Azure OpenAI (separate from standard OpenAI).
"""

import logging
from typing import Any, List, Optional

from openai import AsyncAzureOpenAI

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
)

logger = logging.getLogger(__name__)


class AzureOpenAIProvider(BaseLLMProvider):
    """
    Azure OpenAI provider implementation using AzureOpenAI SDK client.
    """

    def __init__(
        self,
        api_key: str,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: int = 60,
        api_version: str = "2024-10-21",
        **kwargs: Any,
    ) -> None:
        """
        Initialize the Azure OpenAI provider.

        Args:
            api_key: The API key for authentication
            api_endpoint: Azure endpoint URL
            model: The deployment name (model name in Azure)
            max_tokens: Maximum tokens for responses
            temperature: Sampling temperature
            timeout: Request timeout in seconds
            api_version: Azure OpenAI API version
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
        self.api_version = api_version

        if not self.api_endpoint:
            raise ValueError("Azure OpenAI requires api_endpoint to be provided")

        # Initialize Azure OpenAI client
        self.client: AsyncAzureOpenAI = AsyncAzureOpenAI(
            api_key=self.api_key,
            api_version=self.api_version,
            azure_endpoint=self.api_endpoint,
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
            return bool(self.api_key and self.api_endpoint)
        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        """
        Get the name of the provider.

        Returns:
            The provider name
        """
        return "azure_openai"

    @property
    def supported_models(self) -> List[str]:
        """
        Get the list of supported models (deployments) for this provider.

        Returns:
            List of supported model names
        """
        # Note: On Azure, these are deployment names configured in your resource
        return [
            "gpt-4o",
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "gpt-5",
        ]
