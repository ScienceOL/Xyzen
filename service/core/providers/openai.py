"""
OpenAI LLM Provider implementation.
Supports both Azure OpenAI and standard OpenAI API.
"""

import logging
from typing import Any, AsyncGenerator, List, Literal, Optional, Union, cast

from openai import AzureOpenAI, OpenAI
from openai.types.chat import (
    ChatCompletionMessageParam,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionStreamChunk,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI provider implementation supporting both Azure OpenAI and standard OpenAI.
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        azure_endpoint: Optional[str] = None,
        api_version: Optional[str] = None,
        is_azure: bool = False,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the OpenAI provider.

        Args:
            api_key: The API key for authentication
            base_url: Base URL for the API (for standard OpenAI)
            api_version: API version (for Azure OpenAI)
            azure_endpoint: Azure endpoint URL (for Azure OpenAI)
            is_azure: Whether to use Azure OpenAI
            **kwargs: Additional configuration
        """
        super().__init__(api_key, base_url, **kwargs)
        self.api_version = api_version
        self.azure_endpoint = azure_endpoint
        self.is_azure = is_azure

        # Initialize the appropriate client
        if self.is_azure:
            endpoint = self.azure_endpoint
            if not endpoint:
                raise ValueError("Azure OpenAI requires either azure_endpoint or base_url")
            self.client: Union[AzureOpenAI, OpenAI] = AzureOpenAI(
                api_key=self.api_key,
                api_version=self.api_version,
                azure_endpoint=endpoint,
            )
        else:
            logger.info("Initializing standard OpenAI client")
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
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
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")
                # Don't raise an error, just log a warning - let API decide if model is valid

            # Convert standard messages to OpenAI format
            messages = []
            for i, msg in enumerate(request.messages):
                if msg.role == "tool":
                    # OpenAI requires tool messages to have tool_call_id and follow a message with tool_calls
                    # Skip tool messages that don't have a proper context or convert them to user messages
                    prev_msg = request.messages[i - 1] if i > 0 else None
                    has_tool_calls = (
                        prev_msg and hasattr(prev_msg, "tool_calls") and getattr(prev_msg, "tool_calls", None)
                    )
                    if has_tool_calls:
                        # This is a proper tool response, but we need tool_call_id
                        # For now, convert to user message with clear indication it's a tool result
                        message_dict = {
                            "role": "user",
                            "content": f"Tool execution result: {msg.content}",
                        }
                    else:
                        # Convert tool messages to user messages to avoid OpenAI validation errors
                        message_dict = {
                            "role": "user",
                            "content": f"Tool result: {msg.content}",
                        }
                else:
                    message_dict = {"role": msg.role, "content": msg.content}
                messages.append(message_dict)

            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "messages": messages,
                "temperature": request.temperature,
            }

            if request.max_tokens:
                api_params["max_tokens"] = request.max_tokens

            # Handle tools if provided
            if request.tools:
                tools: List[ChatCompletionToolParam] = []
                for tool in request.tools:
                    openai_tool: ChatCompletionToolParam = {
                        "type": "function",
                        "function": {
                            "name": tool.get("name", ""),
                            "description": tool.get("description", ""),
                            "parameters": tool.get("parameters", {}),
                        },
                    }
                    tools.append(openai_tool)

                api_params["tools"] = tools
                if request.tool_choice:
                    api_params["tool_choice"] = request.tool_choice

            # Make the API call
            max_tokens_value = api_params.get("max_tokens")
            max_tokens = cast(int, max_tokens_value) if max_tokens_value is not None else None

            try:
                if "tools" in api_params and api_params["tools"] is not None:
                    tools = cast(List[ChatCompletionToolParam], api_params["tools"])
                    if "tool_choice" in api_params and api_params["tool_choice"] is not None:
                        # Handle tool_choice - OpenAI supports "auto", "none", "required", or specific tool
                        tool_choice_val = str(api_params["tool_choice"])
                        tool_choice: Literal["auto", "none", "required"] = "auto"
                        if tool_choice_val in ["auto", "none", "required"]:
                            tool_choice = tool_choice_val  # type: ignore

                        response = self.client.chat.completions.create(
                            model=cast(str, api_params["model"]),
                            messages=cast(List[ChatCompletionMessageParam], api_params["messages"]),
                            temperature=cast(float, api_params["temperature"]),
                            max_tokens=max_tokens,
                            tools=tools,
                            tool_choice=tool_choice,
                        )
                    else:
                        response = self.client.chat.completions.create(
                            model=cast(str, api_params["model"]),
                            messages=cast(List[ChatCompletionMessageParam], api_params["messages"]),
                            temperature=cast(float, api_params["temperature"]),
                            max_tokens=max_tokens,
                            tools=tools,
                        )
                else:
                    response = self.client.chat.completions.create(
                        model=cast(str, api_params["model"]),
                        messages=cast(List[ChatCompletionMessageParam], api_params["messages"]),
                        temperature=cast(float, api_params["temperature"]),
                        max_tokens=max_tokens,
                    )
            except Exception as api_error:
                logger.error(f"OpenAI API request failed for model {api_params['model']}: {api_error}")
                raise ValueError(f"OpenAI API error: {api_error}")

            # Validate response format
            if not hasattr(response, "choices") or not response.choices:
                logger.error(f"Invalid response format from OpenAI API: {response}")
                raise ValueError("Invalid response format from OpenAI API")

            # Extract response data
            message = response.choices[0].message
            content = message.content
            tool_calls = []

            if hasattr(message, "tool_calls") and message.tool_calls:
                for tool_call in message.tool_calls:
                    tool_calls.append(
                        {
                            "id": tool_call.id,
                            "type": tool_call.type,
                            "function": {
                                "name": tool_call.function.name,
                                "arguments": tool_call.function.arguments,
                            },
                        }
                    )

            usage_info = None
            if response.usage:
                usage_info = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            return ChatCompletionResponse(
                content=content,
                tool_calls=tool_calls if tool_calls else None,
                finish_reason=response.choices[0].finish_reason,
                usage=usage_info,
            )

        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            raise e

    async def chat_completion_stream(
        self, request: ChatCompletionRequest
    ) -> AsyncGenerator[ChatCompletionStreamChunk, None]:
        """
        Generate a streaming chat completion using OpenAI API.

        Args:
            request: The chat completion request

        Yields:
            Stream chunks of the completion response
        """
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")

            # Convert standard messages to OpenAI format (same as regular completion)
            messages = []
            for i, msg in enumerate(request.messages):
                if msg.role == "tool":
                    prev_msg = request.messages[i - 1] if i > 0 else None
                    has_tool_calls = (
                        prev_msg and hasattr(prev_msg, "tool_calls") and getattr(prev_msg, "tool_calls", None)
                    )
                    if has_tool_calls:
                        message_dict = {
                            "role": "user",
                            "content": f"Tool execution result: {msg.content}",
                        }
                    else:
                        message_dict = {
                            "role": "user",
                            "content": f"Tool result: {msg.content}",
                        }
                else:
                    message_dict = {"role": msg.role, "content": msg.content}
                messages.append(message_dict)

            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "messages": messages,
                "temperature": request.temperature,
                "stream": True,  # Enable streaming
            }

            if request.max_tokens:
                api_params["max_tokens"] = request.max_tokens

            # Note: Streaming typically doesn't support tools, so we skip tool handling for now
            if request.tools:
                logger.warning("Tools are not supported in streaming mode, falling back to regular completion")
                # Fall back to regular completion for tool calls
                response = await self.chat_completion(request)
                if response.content:
                    yield ChatCompletionStreamChunk(content=response.content, finish_reason=response.finish_reason)
                return

            # Make the streaming API call
            max_tokens_value = api_params.get("max_tokens")
            max_tokens = cast(int, max_tokens_value) if max_tokens_value is not None else None

            stream = self.client.chat.completions.create(
                model=cast(str, api_params["model"]),
                messages=cast(List[ChatCompletionMessageParam], api_params["messages"]),
                temperature=cast(float, api_params["temperature"]),
                max_tokens=max_tokens,
                stream=True,
            )

            for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    choice = chunk.choices[0]
                    if choice.delta and choice.delta.content:
                        yield ChatCompletionStreamChunk(
                            content=choice.delta.content,
                            finish_reason=choice.finish_reason,
                        )
                    elif choice.finish_reason:
                        yield ChatCompletionStreamChunk(
                            content=None,
                            finish_reason=choice.finish_reason,
                        )

        except Exception as e:
            logger.error(f"OpenAI streaming API call failed: {e}")
            raise e

    def is_available(self) -> bool:
        """
        Check if the OpenAI provider is properly configured and available.

        Returns:
            True if the provider is available, False otherwise
        """
        try:
            if not self.api_key:
                return False

            if self.is_azure:
                return bool(self.azure_endpoint or self.base_url)
            else:
                return True  # Standard OpenAI only needs API key

        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        """
        Get the name of the provider.

        Returns:
            The provider name
        """
        return "azure_openai" if self.is_azure else "openai"

    @property
    def supported_models(self) -> List[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        if self.is_azure:
            # Azure OpenAI models are deployment-specific
            return ["gpt-4o", "gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"]
        else:
            # Standard OpenAI models
            return [
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4-turbo",
                "gpt-4",
                "gpt-3.5-turbo",
                "gpt-3.5-turbo-16k",
            ]
