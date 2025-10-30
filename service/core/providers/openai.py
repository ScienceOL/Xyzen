"""
OpenAI LLM Provider implementation.
Standard OpenAI API support (use AzureOpenAIProvider for Azure).
"""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from pydantic import BaseModel, SecretStr

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
)

logger = logging.getLogger(__name__)


class OpenAIConfig(BaseModel):
    """Configuration for OpenAI provider."""

    organization: str | None = None
    base_url: str | None = None


class OpenAIProvider(BaseLLMProvider):
    """
    Standard OpenAI provider implementation.
    For Azure OpenAI, use AzureOpenAIProvider instead.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 60,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the OpenAI provider with capability-aware parameters.

        Args:
            api_key: The API key for authentication
            api_endpoint: API endpoint URL (defaults to OpenAI's official endpoint)
            model: The default model name
            max_tokens: Maximum tokens for responses (optional)
            temperature: Sampling temperature (optional)
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
            api_key=str(self.api_key),
            base_url=self.api_endpoint,
            timeout=self.timeout,
        )

        # Mark as supporting streaming
        self._streaming_supported = True

    def _convert_messages(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        """
        Convert standard messages to OpenAI format.

        Args:
            messages: List of standard chat messages

        Returns:
            List of OpenAI-formatted messages
        """
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using OpenAI API with capability-aware parameters.

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
                raise ValueError("No choices returned from OpenAI API")

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
            logger.error(f"OpenAI API error: {e}")
            raise

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
    def supported_models(self) -> list[str]:
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
            # Note: GPT-5 is available through Azure OpenAI, not standard OpenAI
        ]

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain ChatOpenAI model instance with capability-aware parameters.

        Returns:
            ChatOpenAI instance ready for use with LangChain
        """
        # Parse provider-specific config
        config = OpenAIConfig(**self.config) if self.config else OpenAIConfig()

        # Get model capabilities
        capabilities = self.get_model_capabilities(self.model)

        # Base parameters
        langchain_params: dict[str, Any] = {
            "api_key": self.api_key,
            "base_url": config.base_url or self.api_endpoint,
            "model": self.model,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Add organization if specified
        if config.organization:
            langchain_params["organization"] = config.organization

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

        return ChatOpenAI(**langchain_params)
