"""Tests for OpenAIProvider."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import SecretStr

from core.providers.base import ChatCompletionRequest, ChatMessage
from core.providers.openai import OpenAIConfig, OpenAIProvider


class TestOpenAIConfig:
    """Test OpenAIConfig configuration model."""

    def test_config_defaults(self):
        """Test default configuration values."""
        config = OpenAIConfig()

        assert config.organization is None
        assert config.base_url is None

    def test_config_with_values(self):
        """Test configuration with custom values."""
        config = OpenAIConfig(
            organization="test-org",
            base_url="https://custom.api/v1",
        )

        assert config.organization == "test-org"
        assert config.base_url == "https://custom.api/v1"


class TestOpenAIProvider:
    """Test OpenAIProvider implementation."""

    @pytest.fixture
    def mock_openai_client(self):
        """Mock OpenAI client for testing."""
        with patch("core.providers.openai.AsyncOpenAI") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            yield mock_client

    def test_provider_initialization(self, mock_openai_client: MagicMock) -> None:
        """Test OpenAI provider initialization."""
        provider = OpenAIProvider(
            api_key=SecretStr("sk-test-key"),
            api_endpoint="https://api.openai.com/v1",
            model="gpt-4o",
            max_tokens=2000,
            temperature=0.7,
            timeout=30,
        )

        assert provider.provider_name == "openai"
        assert provider.model == "gpt-4o"
        assert provider.max_tokens == 2000
        assert provider.temperature == 0.7
        assert provider.timeout == 30
        assert provider.api_endpoint == "https://api.openai.com/v1"

    def test_provider_initialization_defaults(self, mock_openai_client: MagicMock) -> None:
        """Test provider initialization with defaults."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        assert provider.model == "gpt-4o"  # default
        assert provider.max_tokens is None
        assert provider.temperature is None
        assert provider.timeout == 60  # default

    def test_supported_models(self, mock_openai_client: MagicMock) -> None:
        """Test supported models list."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        models = provider.supported_models
        assert "gpt-4o" in models
        assert "gpt-4o-mini" in models
        assert "gpt-4-turbo" in models
        assert "gpt-3.5-turbo" in models
        assert "o1-preview" in models
        assert "o1-mini" in models

        # GPT-5 should not be in standard OpenAI (it's Azure only)
        assert "gpt-5" not in models

    def test_is_available_with_key(self, mock_openai_client: MagicMock) -> None:
        """Test availability check with API key."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))
        assert provider.is_available() is True

    def test_is_available_without_key(self, mock_openai_client: MagicMock) -> None:
        """Test availability check without API key."""
        provider = OpenAIProvider(api_key=SecretStr(""))
        assert provider.is_available() is False

    def test_convert_messages(self, mock_openai_client: MagicMock) -> None:
        """Test message conversion to OpenAI format."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        messages = [
            ChatMessage(role="system", content="You are helpful"),
            ChatMessage(role="user", content="Hello"),
            ChatMessage(role="assistant", content="Hi there!"),
        ]

        # Test protected method directly for implementation verification
        converted = provider._convert_messages(messages)  # pyright: ignore [reportPrivateUsage]

        expected = [
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]

        assert converted == expected

    async def test_chat_completion_basic(self, mock_openai_client: MagicMock) -> None:
        """Test basic chat completion."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        # Mock response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Hello! How can I help you?"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.choices[0].message.tool_calls = None
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 8
        mock_response.usage.total_tokens = 18

        mock_openai_client.chat.completions.create.return_value = mock_response

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4o",
        )

        response = await provider.chat_completion(request)

        assert response.content == "Hello! How can I help you?"
        assert response.finish_reason == "stop"
        assert response.tool_calls is None
        assert response.usage is not None
        assert response.usage["prompt_tokens"] == 10
        assert response.usage["completion_tokens"] == 8
        assert response.usage["total_tokens"] == 18

    async def test_chat_completion_with_tools(self, mock_openai_client: MagicMock) -> None:
        """Test chat completion with tool calls."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        # Mock response with tool calls
        mock_tool_call = MagicMock()
        mock_tool_call.id = "call_123"
        mock_tool_call.type = "function"
        mock_tool_call.function.name = "get_weather"
        mock_tool_call.function.arguments = '{"location": "San Francisco"}'

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None
        mock_response.choices[0].message.tool_calls = [mock_tool_call]
        mock_response.choices[0].finish_reason = "tool_calls"
        mock_response.usage.prompt_tokens = 15
        mock_response.usage.completion_tokens = 5
        mock_response.usage.total_tokens = 20

        mock_openai_client.chat.completions.create.return_value = mock_response

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
            messages=[ChatMessage(role="user", content="What's the weather in SF?")],
            model="gpt-4o",
            tools=tools,
            tool_choice="auto",
        )

        response = await provider.chat_completion(request)

        assert response.content is None
        assert response.finish_reason == "tool_calls"
        assert response.tool_calls is not None
        assert len(response.tool_calls) == 1
        assert response.tool_calls[0]["id"] == "call_123"
        assert response.tool_calls[0]["function"]["name"] == "get_weather"

    async def test_chat_completion_o1_model(self, mock_openai_client: MagicMock) -> None:
        """Test chat completion with o1 model (limited parameters)."""
        provider = OpenAIProvider(
            api_key=SecretStr("sk-test-key"),
            temperature=0.7,  # Should be filtered out
            max_tokens=1000,  # Should be filtered out
        )

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "I'll help you with that."
        mock_response.choices[0].finish_reason = "stop"
        mock_response.choices[0].message.tool_calls = None
        mock_response.usage = None

        mock_openai_client.chat.completions.create.return_value = mock_response

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Solve this problem")],
            model="o1-preview",
            temperature=0.5,  # Should be filtered out
            max_tokens=2000,  # Should be filtered out
        )

        await provider.chat_completion(request)

        # Verify the API was called without temperature and max_tokens
        call_args = mock_openai_client.chat.completions.create.call_args
        api_params = call_args[1] if call_args else {}

        assert "temperature" not in api_params
        assert "max_tokens" not in api_params
        assert api_params["model"] == "o1-preview"

    async def test_chat_completion_api_error(self, mock_openai_client: MagicMock) -> None:
        """Test chat completion with API error."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        # Mock API error
        mock_openai_client.chat.completions.create.side_effect = Exception("API Error")

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4o",
        )

        with pytest.raises(Exception, match="API Error"):
            await provider.chat_completion(request)

    async def test_chat_completion_no_choices(self, mock_openai_client: MagicMock) -> None:
        """Test chat completion with no choices in response."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))

        # Mock response with no choices
        mock_response = MagicMock()
        mock_response.choices = []

        mock_openai_client.chat.completions.create.return_value = mock_response

        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4o",
        )

        with pytest.raises(ValueError, match="No choices returned"):
            await provider.chat_completion(request)

    @patch("core.providers.openai.ChatOpenAI")
    def test_to_langchain_model(self, mock_chat_openai: MagicMock, mock_openai_client: MagicMock) -> None:
        """Test conversion to LangChain model."""
        provider = OpenAIProvider(
            api_key=SecretStr("sk-test-key"),
            api_endpoint="https://api.openai.com/v1",
            model="gpt-4o",
            temperature=0.7,
            max_tokens=2000,
            timeout=30,
            organization="test-org",
        )

        provider.to_langchain_model()

        # Verify ChatOpenAI was called with correct parameters
        mock_chat_openai.assert_called_once()
        call_args = mock_chat_openai.call_args[1]

        assert call_args["api_key"] == provider.api_key
        assert call_args["base_url"] == "https://api.openai.com/v1"
        assert call_args["model"] == "gpt-4o"
        assert call_args["temperature"] == 0.7
        assert call_args["max_completion_tokens"] == 2000
        assert call_args["timeout"] == 30
        assert call_args["streaming"] is True
        assert call_args["organization"] == "test-org"

    @patch("core.providers.openai.ChatOpenAI")
    def test_to_langchain_model_o1(self, mock_chat_openai: MagicMock, mock_openai_client: MagicMock) -> None:
        """Test conversion to LangChain model with o1 (filtered parameters)."""
        provider = OpenAIProvider(
            api_key=SecretStr("sk-test-key"),
            model="o1-preview",
            temperature=0.7,  # Should be filtered
            max_tokens=2000,  # Should be filtered
        )

        provider.to_langchain_model()

        # Verify filtered parameters are not passed
        call_args = mock_chat_openai.call_args[1]
        assert "temperature" not in call_args
        assert "max_completion_tokens" not in call_args
        assert call_args["model"] == "o1-preview"

    @patch("core.providers.openai.AsyncOpenAI")
    def test_client_initialization_custom_config(
        self, mock_async_openai: MagicMock, mock_openai_client: MagicMock
    ) -> None:
        """Test client initialization with custom configuration."""
        OpenAIProvider(
            api_key=SecretStr("sk-test-key"),
            api_endpoint="https://custom.api.com/v1",
            timeout=120,
        )

        # Verify AsyncOpenAI was initialized with correct parameters
        # Note: API key is masked for security, so we check for the masked value
        mock_async_openai.assert_called_with(
            api_key="**********",
            base_url="https://custom.api.com/v1",
            timeout=120,
        )

    def test_streaming_support(self, mock_openai_client: MagicMock) -> None:
        """Test streaming support indication."""
        provider = OpenAIProvider(api_key=SecretStr("sk-test-key"))
        assert provider.supports_streaming() is True
