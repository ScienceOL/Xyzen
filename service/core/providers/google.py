"""
Google Gemini LLM Provider implementation.
Supports Google Gemini models with proper message and tool format conversion.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict

from google import genai
from google.genai import types
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, SecretStr

from .base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionStreamChunk,
    ChatMessage,
)

logger = logging.getLogger(__name__)


class GoogleConfig(BaseModel):
    """Configuration for Google provider."""

    project_id: str | None = None
    location: str = "us-central1"
    base_url: str | None = None


class GoogleProvider(BaseLLMProvider):
    """
    Google Gemini provider implementation.
    Handles message format conversion between standard format and Google's format.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,  # Now optional
        temperature: float | None = None,  # Now optional
        timeout: int = 60,
        vertexai: bool = False,
        project: str | None = None,
        location: str | None = None,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the Google provider with capability-aware parameters.

        Args:
            api_key: The API key for authentication
            api_endpoint: Optional API endpoint URL (not used by Google GenAI)
            model: The default model name
            max_tokens: Maximum tokens for responses (optional)
            temperature: Sampling temperature (optional)
            timeout: Request timeout in seconds
            vertexai: Whether to use Vertex AI endpoints
            project: Google Cloud project ID (for Vertex AI)
            location: Google Cloud location (for Vertex AI)
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
        self.vertexai = vertexai
        self.project = project
        self.location = location

        # Initialize Google GenAI client
        if self.vertexai:
            if not self.project or not self.location:
                raise ValueError("Vertex AI requires both project and location parameters")
            self.client = genai.Client(
                vertexai=True,
                project=self.project,
                location=self.location,
                credentials=None,  # Use default credentials
            )
        else:
            self.client = genai.Client(api_key=str(self.api_key))

        # Mark as supporting streaming
        self._streaming_supported = True

    def _convert_messages(self, messages: list[ChatMessage]) -> tuple[list[types.Content], str]:
        """
        Convert standard messages to Google Gemini format.
        Google separates system messages as system_instruction from conversation messages.

        Args:
            messages: List of standard chat messages

        Returns:
            Tuple of (google_contents, system_instruction)
        """
        system_instruction = ""
        contents: list[types.Content] = []

        for msg in messages:
            if msg.role == "system":
                system_instruction = msg.content
            elif msg.role == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=msg.content)]))
            elif msg.role == "assistant":
                contents.append(types.Content(role="model", parts=[types.Part(text=msg.content)]))
            elif msg.role == "tool":
                # For Google, tool results should be sent as user messages
                contents.append(types.Content(role="user", parts=[types.Part(text=f"Tool result: {msg.content}")]))

        return contents, system_instruction

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Generate a chat completion using Google Gemini API with capability-aware parameters.

        Args:
            request: The chat completion request

        Returns:
            The chat completion response
        """
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")

            # Convert messages to Google format using the specialized method
            contents, system_instruction = self._convert_messages(request.messages)

            # Get model capabilities
            capabilities = self.get_model_capabilities(request.model)

            # Build configuration with capability-aware parameters
            config_params: dict[str, Any] = {}

            # Add optional parameters based on capabilities
            if capabilities.supports_temperature and request.temperature is not None:
                config_params["temperature"] = request.temperature
            elif capabilities.supports_temperature and self.temperature is not None:
                config_params["temperature"] = self.temperature

            if capabilities.supports_max_tokens:
                config_params["max_output_tokens"] = request.max_tokens or self.max_tokens or 8192
            else:
                config_params["max_output_tokens"] = 8192  # Google usually requires this

            # Create configuration
            config = types.GenerateContentConfig(**config_params)

            # Add system instruction if present
            if system_instruction:
                config.system_instruction = system_instruction

            # Make the API call - tools will be handled in config_params if supported
            api_call_params = {
                "model": request.model,
                "contents": contents,
                "config": config,
            }

            # Handle tools if provided and supported
            if capabilities.supports_tools and request.tools:
                try:
                    # Try to include tools in the configuration parameters
                    tool_declarations = []
                    for tool in request.tools:
                        function_declaration = types.FunctionDeclaration(
                            name=tool.get("name", ""),
                            description=tool.get("description", ""),
                            parameters=tool.get("parameters", {}),
                        )
                        tool_declarations.append(function_declaration)

                    if tool_declarations:
                        # Some versions of the Google GenAI library may support tools differently
                        # For now, we'll log that tools are requested but not fully supported
                        logger.info(
                            f"Tools requested for {request.model} but may not be fully supported in this implementation"
                        )
                except Exception as tool_error:
                    logger.warning(f"Failed to process tools for {request.model}: {tool_error}")

            # Make the API call
            response = await self.client.aio.models.generate_content(**api_call_params)

            # Validate response format
            if not hasattr(response, "candidates") or not response.candidates:
                logger.error(f"Invalid response format from Google API: {response}")
                raise ValueError("Invalid response format from Google API")

            # Extract response content
            content_text = ""
            tool_calls: list[Dict[str, Any]] = []

            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text:
                        content_text += part.text
                    elif hasattr(part, "function_call") and part.function_call:
                        # Handle function calls
                        tool_calls.append(
                            {
                                "id": getattr(part.function_call, "id", f"call_{len(tool_calls)}"),
                                "type": "function",
                                "function": {
                                    "name": part.function_call.name,
                                    "arguments": (
                                        json.dumps(dict(part.function_call.args)) if part.function_call.args else "{}"
                                    ),
                                },
                            }
                        )

            # Extract usage information
            usage_info = None
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                usage_info = {
                    "prompt_tokens": response.usage_metadata.prompt_token_count or 0,
                    "completion_tokens": response.usage_metadata.candidates_token_count or 0,
                    "total_tokens": response.usage_metadata.total_token_count or 0,
                }

            return ChatCompletionResponse(
                content=content_text if content_text else None,
                tool_calls=tool_calls if tool_calls else None,
                finish_reason=candidate.finish_reason,
                usage=usage_info,
            )

        except Exception as e:
            logger.error(f"Google API call failed: {e}")
            raise

    async def chat_completion_stream(
        self, request: ChatCompletionRequest
    ) -> AsyncGenerator[ChatCompletionStreamChunk, None]:
        """
        Generate a streaming chat completion using Google Gemini API.

        Args:
            request: The chat completion request

        Yields:
            Stream chunks of the completion response
        """
        try:
            # Validate model
            if request.model not in self.supported_models:
                logger.warning(f"Model {request.model} is not in the supported models list for {self.provider_name}")

            # Convert messages to Google format using the specialized method
            contents, system_instruction = self._convert_messages(request.messages)

            # Get model capabilities for parameter filtering
            capabilities = self.get_model_capabilities(request.model)

            # Build configuration with capability-aware parameters
            config_params: dict[str, Any] = {}

            # Add optional parameters based on capabilities
            if capabilities.supports_temperature and request.temperature is not None:
                config_params["temperature"] = request.temperature
            elif capabilities.supports_temperature and self.temperature is not None:
                config_params["temperature"] = self.temperature

            if capabilities.supports_max_tokens:
                config_params["max_output_tokens"] = request.max_tokens or self.max_tokens or 8192
            else:
                config_params["max_output_tokens"] = 8192

            # Create configuration
            config = types.GenerateContentConfig(**config_params)

            if system_instruction:
                config.system_instruction = system_instruction

            # Note: Streaming typically doesn't support tools well, so we skip tool handling for now
            if request.tools:
                logger.warning("Tools are not supported in streaming mode, falling back to regular completion")
                # Fall back to regular completion for tool calls
                response = await self.chat_completion(request)
                if response.content:
                    yield ChatCompletionStreamChunk(content=response.content, finish_reason=response.finish_reason)
                return

            # Make the streaming API call
            try:
                stream = await self.client.aio.models.generate_content_stream(
                    model=request.model,
                    contents=contents,
                    config=config,
                )

                async for chunk in stream:
                    if chunk.candidates and len(chunk.candidates) > 0:
                        candidate = chunk.candidates[0]
                        if candidate.content and candidate.content.parts:
                            for part in candidate.content.parts:
                                if hasattr(part, "text") and part.text:
                                    yield ChatCompletionStreamChunk(content=part.text, finish_reason=None)

                        if candidate.finish_reason:
                            yield ChatCompletionStreamChunk(content="", finish_reason=candidate.finish_reason)

            except Exception as api_error:
                logger.error(f"Google streaming API request failed for model {request.model}: {api_error}")
                raise ValueError(f"Google streaming API error: {api_error}")

        except Exception as e:
            logger.error(f"Google streaming API call failed: {e}")
            raise e

    def is_available(self) -> bool:
        """
        Check if the Google provider is properly configured and available.

        Returns:
            True if the provider is available, False otherwise
        """
        try:
            if self.vertexai:
                return bool(self.project and self.location)
            else:
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
        return "vertex_ai" if self.vertexai else "google"

    @property
    def supported_models(self) -> list[str]:
        """
        Get the list of supported models for this provider.

        Returns:
            List of supported model names
        """
        if self.vertexai:
            # Vertex AI models
            return [
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "gemini-2.0-flash-exp",
                "gemini-1.5-pro",
                "gemini-1.5-flash",
                "gemini-1.0-pro",
            ]
        else:
            # Google AI Studio models
            return [
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "gemini-2.0-flash-exp",
                "gemini-1.5-pro-latest",
                "gemini-1.5-pro",
                "gemini-1.5-flash-latest",
                "gemini-1.5-flash",
                "gemini-1.5-flash-8b-latest",
                "gemini-1.5-flash-8b",
                "gemini-1.0-pro-latest",
                "gemini-1.0-pro",
            ]

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain ChatGoogleGenerativeAI model instance with capability-aware parameters.

        Returns:
            ChatGoogleGenerativeAI instance ready for use with LangChain
        """
        # Get model capabilities
        capabilities = self.get_model_capabilities(self.model)

        # Base parameters
        langchain_params: dict[str, Any] = {
            "google_api_key": self.api_key,
            "model": self.model,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Add optional parameters based on capabilities
        if capabilities.supports_temperature and self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        if capabilities.supports_max_tokens and self.max_tokens is not None:
            langchain_params["max_output_tokens"] = self.max_tokens

        # Log filtered parameters for debugging
        filtered_out = []
        if not capabilities.supports_temperature and self.temperature is not None:
            filtered_out.append("temperature")
        if not capabilities.supports_max_tokens and self.max_tokens is not None:
            filtered_out.append("max_output_tokens")

        if filtered_out:
            logger.info(f"Filtered out unsupported LangChain parameters for {self.model}: {filtered_out}")

        return ChatGoogleGenerativeAI(**langchain_params)
