"""
Anthropic LLM Provider implementation.
Supports Anthropic Claude models with proper message and tool format conversion.
"""

import json
import logging
from typing import Any, List, Optional

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam
from anthropic.types.tool_param import ToolParam
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr

from models.provider import AnthropicConfig

from .base import BaseLLMProvider, ChatCompletionRequest, ChatCompletionResponse

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic provider implementation for Claude models.
    Handles message format conversion between standard format and Anthropic's format.
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
        Initialize the Anthropic provider.

        Args:
            api_key: The API key for authentication
            api_endpoint: Optional API endpoint URL
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

        # Initialize Anthropic client
        if self.api_endpoint:
            self.client = AsyncAnthropic(api_key=str(self.api_key), base_url=self.api_endpoint, timeout=self.timeout)
        else:
            self.client = AsyncAnthropic(api_key=str(self.api_key), timeout=self.timeout)

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using Anthropic API.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")
                # Don't raise an error, just log a warning - let API decide if model is valid

            # Convert messages to Anthropic format
            system_message = ""
            messages: List[MessageParam] = []

            for msg in request.messages:
                if msg.role == "system":
                    system_message = msg.content
                elif msg.role == "user":
                    messages.append({"role": "user", "content": msg.content})
                elif msg.role == "assistant":
                    messages.append({"role": "assistant", "content": msg.content})
                elif msg.role == "tool":
                    # For Anthropic, tool results should be sent as user messages
                    # with a specific format indicating they are tool results
                    messages.append({"role": "user", "content": f"Tool result: {msg.content}"})

            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "messages": messages,
                "max_tokens": request.max_tokens or 4096,
                "temperature": request.temperature,
            }

            if system_message:
                api_params["system"] = system_message

            # Handle tools if provided
            anthropic_tools: List[ToolParam] = []
            if request.tools:
                for tool in request.tools:
                    anthropic_tool: ToolParam = {
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "input_schema": tool.get("parameters", {}),
                    }
                    anthropic_tools.append(anthropic_tool)

            # Make the API call with proper error handling
            try:
                if system_message and anthropic_tools:
                    response = await self.client.messages.create(
                        model=request.model,
                        messages=messages,
                        max_tokens=request.max_tokens or 4096,
                        temperature=request.temperature,
                        system=system_message,
                        tools=anthropic_tools,
                    )
                elif system_message:
                    response = await self.client.messages.create(
                        model=request.model,
                        messages=messages,
                        max_tokens=request.max_tokens or 4096,
                        temperature=request.temperature,
                        system=system_message,
                    )
                elif anthropic_tools:
                    response = await self.client.messages.create(
                        model=request.model,
                        messages=messages,
                        max_tokens=request.max_tokens or 4096,
                        temperature=request.temperature,
                        tools=anthropic_tools,
                    )
                else:
                    response = await self.client.messages.create(
                        model=request.model,
                        messages=messages,
                        max_tokens=request.max_tokens or 4096,
                        temperature=request.temperature,
                    )
            except Exception as api_error:
                logger.error(f"Anthropic API request failed for model {request.model}: {api_error}")
                raise ValueError(f"Anthropic API error: {api_error}")

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
                            # content_block is a TextBlock object with .text attribute
                            if hasattr(content_block, "text"):
                                content_text += content_block.text
                        elif content_block.type == "tool_use":
                            # content_block is a ToolUseBlock object
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
                        # Try to get the first content block's text
                        first_content = response.content[0]
                        if hasattr(first_content, "text"):
                            content_text = getattr(first_content, "text", "")
                    except Exception:
                        content_text = str(response.content) if response.content else ""

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
            raise e

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
    def supported_models(self) -> List[str]:
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
        Convert this provider to a LangChain ChatAnthropic model instance.

        Returns:
            ChatAnthropic instance ready for use with LangChain
        """
        # Parse provider-specific config
        config = AnthropicConfig(**self.config) if self.config else AnthropicConfig()

        return ChatAnthropic(
            api_key=self.api_key,
            base_url=config.base_url or self.api_endpoint,
            model_name=self.model,
            temperature=self.temperature,
            stop=None,
            max_tokens_to_sample=self.max_tokens,
            timeout=self.timeout,
            streaming=True,
        )
