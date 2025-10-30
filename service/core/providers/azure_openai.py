"""
Azure OpenAI LLM Provider implementation.
Dedicated provider for Azure OpenAI (separate from standard OpenAI).
"""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import AzureChatOpenAI
from openai import AsyncAzureOpenAI
from pydantic import BaseModel, SecretStr

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
)

logger = logging.getLogger(__name__)


class AzureOpenAIConfig(BaseModel):
    """Configuration for Azure OpenAI provider."""

    api_version: str = "2024-02-01"
    azure_deployment: str | None = None
    azure_endpoint: str | None = None


class AzureOpenAIProvider(BaseLLMProvider):
    """
    Azure OpenAI provider implementation using AzureOpenAI SDK client.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 60,
        api_version: str = "2024-10-21",
        **kwargs: Any,
    ) -> None:
        """
        Initialize the Azure OpenAI provider with capability-aware parameters.

        Args:
            api_key: The API key for authentication
            api_endpoint: Azure endpoint URL
            model: The deployment name (model name in Azure)
            max_tokens: Maximum tokens for responses (optional)
            temperature: Sampling temperature (optional)
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
            api_key=str(self.api_key),
            api_version=self.api_version,
            azure_endpoint=self.api_endpoint,
            timeout=self.timeout,
        )

        # Mark as supporting streaming
        self._streaming_supported = True

    def _convert_messages(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        """
        Convert standard messages to Azure OpenAI format.
        Azure OpenAI uses the same message format as standard OpenAI.

        Args:
            messages: List of standard chat messages

        Returns:
            List of Azure OpenAI-formatted messages
        """
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using Azure OpenAI API with capability-aware parameters.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        try:
            # Build parameters using capability filtering
            api_params = self.build_api_params(request)

            # Make API call
            response = await self.client.chat.completions.create(**api_params)

            # Convert response
            choice = response.choices[0] if response.choices else None
            if not choice:
                raise ValueError("No choices returned from Azure OpenAI API")

            # Extract tool calls if present
            tool_calls = None
            if hasattr(choice.message, "tool_calls") and choice.message.tool_calls:
                tool_calls = [
                    {
                        "id": tc.id,
                        "type": tc.type,
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in choice.message.tool_calls
                ]

            # Extract usage information
            usage = None
            if response.usage:
                usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            return ChatCompletionResponse(
                content=choice.message.content,
                tool_calls=tool_calls,
                finish_reason=choice.finish_reason,
                usage=usage,
            )

        except Exception as e:
            logger.error(f"Azure OpenAI API error: {e}")
            raise

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
    def supported_models(self) -> list[str]:
        """
        Get the list of supported models (deployments) for this provider.

        Returns:
            List of supported model names
        """
        # Note: On Azure, these are deployment names configured in your resource
        return [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "o1-preview",
            "o1-mini",
            "gpt-5",  # GPT-5 available on Azure
        ]

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain AzureChatOpenAI model instance with capability-aware parameters.

        Returns:
            AzureChatOpenAI instance ready for use with LangChain
        """
        # Parse provider-specific config
        config = AzureOpenAIConfig(**self.config) if self.config else AzureOpenAIConfig()

        # Get model capabilities
        capabilities = self.get_model_capabilities(self.model)

        # Base parameters
        langchain_params: dict[str, Any] = {
            "api_key": self.api_key,
            "azure_endpoint": config.azure_endpoint or self.api_endpoint,
            "azure_deployment": config.azure_deployment or self.model,
            "api_version": config.api_version,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Add optional parameters based on capabilities
        if capabilities.supports_temperature and self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        if capabilities.supports_max_tokens and self.max_tokens is not None:
            langchain_params["max_completion_tokens"] = self.max_tokens

        # Log filtered parameters for debugging
        filtered_out = []
        if not capabilities.supports_temperature and self.temperature is not None:
            filtered_out.append("temperature")
        if not capabilities.supports_max_tokens and self.max_tokens is not None:
            filtered_out.append("max_completion_tokens")

        if filtered_out:
            logger.info(f"Filtered out unsupported LangChain parameters for {self.model}: {filtered_out}")

        return AzureChatOpenAI(**langchain_params)
