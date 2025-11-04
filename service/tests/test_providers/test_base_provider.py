"""Tests for BaseLLMProvider and ModelRegistry."""

from typing import Any
from unittest.mock import MagicMock
from pydantic import SecretStr

from core.providers.base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ModelCapabilities,
    ModelRegistry,
)


class TestModelCapabilities:
    """Test ModelCapabilities dataclass."""

    def test_default_capabilities(self):
        """Test default model capabilities."""
        caps = ModelCapabilities()

        assert caps.supports_temperature is True
        assert caps.supports_max_tokens is True
        assert caps.supports_tools is True
        assert caps.supports_streaming is True
        assert caps.supports_system_messages is True

    def test_custom_capabilities(self):
        """Test custom model capabilities."""
        caps = ModelCapabilities(
            supports_temperature=False,
            supports_max_tokens=False,
            supports_tools=True,
            supports_streaming=False,
            supports_system_messages=False,
        )

        assert caps.supports_temperature is False
        assert caps.supports_max_tokens is False
        assert caps.supports_tools is True
        assert caps.supports_streaming is False
        assert caps.supports_system_messages is False


class TestModelRegistry:
    """Test ModelRegistry class."""

    def test_get_known_model_capabilities(self):
        """Test getting capabilities for known models."""
        # Test GPT-4o (full capabilities)
        gpt4o_caps = ModelRegistry.get_capabilities("gpt-4o")
        assert gpt4o_caps.supports_temperature is True
        assert gpt4o_caps.supports_max_tokens is True
        assert gpt4o_caps.supports_tools is True

        # Test o1-preview (limited capabilities)
        o1_caps = ModelRegistry.get_capabilities("o1-preview")
        assert o1_caps.supports_temperature is False
        assert o1_caps.supports_max_tokens is False
        assert o1_caps.supports_tools is True

    def test_get_unknown_model_capabilities(self):
        """Test getting capabilities for unknown models (defaults)."""
        unknown_caps = ModelRegistry.get_capabilities("unknown-model-123")

        # Should return default capabilities
        assert unknown_caps.supports_temperature is True
        assert unknown_caps.supports_max_tokens is True
        assert unknown_caps.supports_tools is True
        assert unknown_caps.supports_streaming is True
        assert unknown_caps.supports_system_messages is True

    def test_register_new_model(self):
        """Test registering a new model with custom capabilities."""
        custom_caps = ModelCapabilities(
            supports_temperature=False,
            supports_max_tokens=True,
            supports_tools=False,
        )

        ModelRegistry.register_model("custom-test-model", custom_caps)

        # Verify the model was registered
        retrieved_caps = ModelRegistry.get_capabilities("custom-test-model")
        assert retrieved_caps.supports_temperature is False
        assert retrieved_caps.supports_max_tokens is True
        assert retrieved_caps.supports_tools is False

    def test_list_models(self):
        """Test listing all registered models."""
        models = ModelRegistry.list_models()

        # Should include known models
        assert "gpt-4o" in models
        assert "claude-3-5-sonnet-20241022" in models
        assert "gemini-1.5-pro" in models
        assert "o1-preview" in models

        # Should be a list of strings
        assert all(isinstance(model, str) for model in models)


# Mock concrete implementation for testing
class MockProvider(BaseLLMProvider):
    """Mock provider for testing BaseLLMProvider."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(api_key=SecretStr("mock-key"), api_endpoint="https://mock.api/v1", **kwargs)
        self.chat_completion_responses = []

    def _convert_messages(self, messages: list[Any]) -> list[Any]:
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        if self.chat_completion_responses:
            return self.chat_completion_responses.pop(0)
        return ChatCompletionResponse(
            content="Mock response",
            finish_reason="stop",
        )

    def is_available(self):
        return True

    @property
    def provider_name(self):
        return "mock"

    @property
    def supported_models(self):
        return ["mock-model", "mock-model-2"]

    def to_langchain_model(self):
        return MagicMock()


class TestBaseLLMProvider:
    """Test BaseLLMProvider abstract base class."""

    def test_provider_initialization(self):
        """Test provider initialization with various parameters."""
        provider = MockProvider(
            model="gpt-4o",
            max_tokens=1000,
            temperature=0.7,
            timeout=30,
            custom_param="test-value",
        )

        assert provider.api_key.get_secret_value() == "mock-key"
        assert provider.api_endpoint == "https://mock.api/v1"
        assert provider.model == "gpt-4o"
        assert provider.max_tokens == 1000
        assert provider.temperature == 0.7
        assert provider.timeout == 30
        assert provider.config["custom_param"] == "test-value"

    def test_provider_initialization_minimal(self):
        """Test provider initialization with minimal parameters."""
        provider = MockProvider()

        assert provider.model == "gpt-4o"  # default
        assert provider.max_tokens is None
        assert provider.temperature is None
        assert provider.timeout == 60  # default

    def test_get_model_capabilities(self):
        """Test getting model capabilities through provider."""
        provider = MockProvider()

        # Test known model
        gpt4o_caps = provider.get_model_capabilities("gpt-4o")
        assert gpt4o_caps.supports_temperature is True

        # Test limited model
        o1_caps = provider.get_model_capabilities("o1-preview")
        assert o1_caps.supports_temperature is False

    def test_build_api_params_full_support(self):
        """Test building API parameters for fully supported model."""
        provider = MockProvider(temperature=0.5, max_tokens=2000)

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4o",  # Supports all parameters
            temperature=0.7,
            max_tokens=1500,
        )

        params = provider.build_api_params(request)

        # Should include all parameters
        assert params["model"] == "gpt-4o"
        assert params["temperature"] == 0.7  # From request
        assert params["max_tokens"] == 1500  # From request
        assert "messages" in params

    def test_build_api_params_limited_support(self):
        """Test building API parameters for limited model (o1-preview)."""
        provider = MockProvider(temperature=0.5, max_tokens=2000)

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="o1-preview",  # Limited support
            temperature=0.7,  # Should be filtered out
            max_tokens=1500,  # Should be filtered out
        )

        params = provider.build_api_params(request)

        # Should exclude unsupported parameters
        assert params["model"] == "o1-preview"
        assert "temperature" not in params
        assert "max_tokens" not in params
        assert "messages" in params

    def test_build_api_params_fallback_to_provider_defaults(self):
        """Test fallback to provider defaults when request doesn't specify."""
        provider = MockProvider(temperature=0.5, max_tokens=2000)

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4o",
            # No temperature or max_tokens in request
        )

        params = provider.build_api_params(request)

        # Should use provider defaults
        assert params["temperature"] == 0.5  # Provider default
        assert params["max_tokens"] == 2000  # Provider default

    def test_build_api_params_with_tools(self):
        """Test building API parameters with tools."""
        provider = MockProvider()

        tools: list[dict[str, Any]] = [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get weather info",
                },
            }
        ]

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="What's the weather?")],
            model="gpt-4o",
            tools=tools,
            tool_choice="auto",
        )

        params = provider.build_api_params(request)

        assert params["tools"] == tools
        assert params["tool_choice"] == "auto"

    def test_build_api_params_tools_filtered(self):
        """Test tools being filtered for models that don't support them."""
        # Create a custom model that doesn't support tools
        custom_caps = ModelCapabilities(supports_tools=False)
        ModelRegistry.register_model("no-tools-model", custom_caps)

        provider = MockProvider()

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="no-tools-model",
            tools=[{"type": "function", "function": {"name": "test"}}],
        )

        params = provider.build_api_params(request)

        # Tools should be filtered out
        assert "tools" not in params
        assert "tool_choice" not in params

    def test_supports_streaming_default(self):
        """Test default streaming support."""
        provider = MockProvider()
        assert provider.supports_streaming() is True

    async def test_chat_completion_basic(self):
        """Test basic chat completion functionality."""
        provider = MockProvider()

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="mock-model",
        )

        response = await provider.chat_completion(request)

        assert response.content == "Mock response"
        assert response.finish_reason == "stop"

    def test_provider_properties(self):
        """Test provider properties."""
        provider = MockProvider()

        assert provider.provider_name == "mock"
        assert "mock-model" in provider.supported_models
        assert provider.is_available() is True

    def test_message_conversion(self):
        """Test message conversion."""
        provider = MockProvider()

        messages = [
            ChatMessage(role="system", content="You are helpful"),
            ChatMessage(role="user", content="Hello"),
            ChatMessage(role="assistant", content="Hi there!"),
        ]

        # Test protected method directly for implementation verification
        converted = provider._convert_messages(messages)  # pyright: ignore [reportPrivateUsage]

        assert len(converted) == 3
        assert converted[0]["role"] == "system"
        assert converted[0]["content"] == "You are helpful"
        assert converted[1]["role"] == "user"
        assert converted[1]["content"] == "Hello"
        assert converted[2]["role"] == "assistant"
        assert converted[2]["content"] == "Hi there!"

    def test_langchain_conversion(self):
        """Test LangChain model conversion."""
        provider = MockProvider()
        langchain_model = provider.to_langchain_model()

        # Should return a mock (concrete providers will return real LangChain models)
        assert langchain_model is not None
