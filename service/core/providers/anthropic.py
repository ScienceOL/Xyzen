"""
Anthropic LLM Provider implementation.
Supports Anthropic Claude models with proper message and tool format conversion.
"""

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam
from anthropic.types.tool_param import ToolParam
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, SecretStr

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
)

logger = logging.getLogger(__name__)


class AnthropicConfig(BaseModel):
    """Configuration for Anthropic provider."""

    base_url: str | None = None


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic provider implementation for Claude models.
    Handles message format conversion between standard format and Anthropic's format.
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
        Initialize the Anthropic provider with capability-aware parameters.

        Args:
            api_key: The API key for authentication
            api_endpoint: Optional API endpoint URL
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

        # Initialize Anthropic client
        if self.api_endpoint:
            self.client = AsyncAnthropic(api_key=str(self.api_key), base_url=self.api_endpoint, timeout=self.timeout)
        else:
            self.client = AsyncAnthropic(api_key=str(self.api_key), timeout=self.timeout)

    def _convert_messages(self, messages: list[ChatMessage]) -> tuple[list[MessageParam], str]:
        """
        Convert standard messages to Anthropic format.
        Anthropic separates system messages from the conversation messages.

        Args:
            messages: List of standard chat messages

        Returns:
            Tuple of (anthropic_messages, system_message)
        """
        system_message = ""
        anthropic_messages: list[MessageParam] = []

        for msg in messages:
            if msg.role == "system":
                system_message = msg.content
            elif msg.role == "user":
                anthropic_messages.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                anthropic_messages.append({"role": "assistant", "content": msg.content})
            elif msg.role == "tool":
                # For Anthropic, tool results should be sent as user messages
                # with a specific format indicating they are tool results
                anthropic_messages.append({"role": "user", "content": f"Tool result: {msg.content}"})

        return anthropic_messages, system_message

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using Anthropic API with capability-aware parameters.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")

            # Convert messages to Anthropic format using the specialized method
            messages, system_message = self._convert_messages(request.messages)

            # Build API parameters using capability filtering
            capabilities = self.get_model_capabilities(request.model)

            # Start with required parameters
            api_params: dict[str, Any] = {
                "model": request.model,
                "messages": messages,
            }

            # Add optional parameters based on capabilities
            if capabilities.supports_max_tokens:
                api_params["max_tokens"] = request.max_tokens or self.max_tokens or 4096
            else:
                api_params["max_tokens"] = 4096  # Required for Anthropic

            if capabilities.supports_temperature and request.temperature is not None:
                api_params["temperature"] = request.temperature
            elif capabilities.supports_temperature and self.temperature is not None:
                api_params["temperature"] = self.temperature

            # Add system message if present
            if system_message:
                api_params["system"] = system_message

            # Handle tools if provided and supported
            anthropic_tools: list[ToolParam] = []
            if capabilities.supports_tools and request.tools:
                for tool in request.tools:
                    anthropic_tool: ToolParam = {
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "input_schema": tool.get("parameters", {}),
                    }
                    anthropic_tools.append(anthropic_tool)

                if anthropic_tools:
                    api_params["tools"] = anthropic_tools

            # Make the API call
            response = await self.client.messages.create(**api_params)

            # Validate response format
            if not hasattr(response, "content") or not response.content:
                logger.error(f"Invalid response format from Anthropic API: {response}")
                raise ValueError("Invalid response format from Anthropic API")

            # Extract response content
            content_text = ""
            tool_calls = []

            try:
                for content_block in response.content:
                    if hasattr(content_block, "type"):
                        if content_block.type == "text":
                            if hasattr(content_block, "text"):
                                content_text += content_block.text
                        elif content_block.type == "tool_use":
                            tool_calls.append(
                                {
                                    "id": getattr(content_block, "id", ""),
                                    "type": "function",
                                    "function": {
                                        "name": getattr(content_block, "name", ""),
                                        "arguments": json.dumps(getattr(content_block, "input", {})),
                                    },
                                }
                            )
            except Exception as content_error:
                logger.error(f"Error processing Anthropic response content: {content_error}")
                # Fallback: try to extract text content differently
                if hasattr(response, "content") and response.content:
                    try:
                        first_content = response.content[0]
                        if hasattr(first_content, "text"):
                            content_text = getattr(first_content, "text", "")
                    except Exception:
                        content_text = str(response.content) if response.content else ""

            # Extract usage information
            usage_info = None
            if hasattr(response, "usage") and response.usage:
                usage_info = {
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                }

            return ChatCompletionResponse(
                content=content_text if content_text else None,
                tool_calls=tool_calls if tool_calls else None,
                finish_reason=response.stop_reason,
                usage=usage_info,
            )

        except Exception as e:
            logger.error(f"Anthropic API call failed: {e}")
            raise

    def is_available(self) -> bool:
        """
        Check if the Anthropic provider is properly configured and available.

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
        return "anthropic"

    @property
    def supported_models(self) -> list[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        return [
            "claude-3-5-sonnet-20241022",
            "claude-3-5-sonnet-20240620",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
        ]

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain ChatAnthropic model instance with capability-aware parameters.

        Returns:
            ChatAnthropic instance ready for use with LangChain
        """
        # Parse provider-specific config
        config = AnthropicConfig(**self.config) if self.config else AnthropicConfig()

        # Get model capabilities
        capabilities = self.get_model_capabilities(self.model)

        # Base parameters
        langchain_params: dict[str, Any] = {
            "api_key": self.api_key,
            "base_url": config.base_url or self.api_endpoint,
            "model_name": self.model,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Add optional parameters based on capabilities
        if capabilities.supports_temperature and self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        if capabilities.supports_max_tokens and self.max_tokens is not None:
            langchain_params["max_tokens_to_sample"] = self.max_tokens

        # Log filtered parameters for debugging
        filtered_out = []
        if not capabilities.supports_temperature and self.temperature is not None:
            filtered_out.append("temperature")
        if not capabilities.supports_max_tokens and self.max_tokens is not None:
            filtered_out.append("max_tokens_to_sample")

        if filtered_out:
            logger.info(f"Filtered out unsupported LangChain parameters for {self.model}: {filtered_out}")

        return ChatAnthropic(**langchain_params)
