"""AI provider-related test fixtures."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from core.providers.base import (
    ChatCompletionRequest,
    ChatMessage,
    ModelCapabilities,
)
from models.provider import Provider, ProviderCreate


@pytest.fixture
def openai_provider_data() -> ProviderCreate:
    """Create OpenAI provider test data."""
    return ProviderCreate(
        user_id="test-user-123",
        name="Test OpenAI Provider",
        provider_type="openai",
        api="https://api.openai.com/v1",
        key="sk-test-openai-key-123",
        timeout=60,
        model="gpt-4o",
        max_tokens=4096,
        temperature=0.7,
        is_system=False,
        provider_config={"organization": "test-org"},
    )


@pytest.fixture
def anthropic_provider_data() -> ProviderCreate:
    """Create Anthropic provider test data."""
    return ProviderCreate(
        user_id="test-user-123",
        name="Test Anthropic Provider",
        provider_type="anthropic",
        api="https://api.anthropic.com",
        key="sk-ant-api03-test-key-123",
        timeout=60,
        model="claude-3-5-sonnet-20241022",
        max_tokens=8192,
        temperature=0.5,
        is_system=False,
        provider_config={"version": "2023-06-01"},
    )


@pytest.fixture
def azure_openai_provider_data() -> ProviderCreate:
    """Create Azure OpenAI provider test data."""
    return ProviderCreate(
        user_id="test-user-123",
        name="Test Azure OpenAI Provider",
        provider_type="azure_openai",
        api="https://test-resource.openai.azure.com",
        key="test-azure-key-123",
        timeout=60,
        model="gpt-4o",
        max_tokens=4096,
        temperature=0.7,
        is_system=False,
        provider_config={
            "api_version": "2024-02-15-preview",
            "deployment_name": "gpt-4o-deployment",
        },
    )


@pytest.fixture
def google_provider_data() -> ProviderCreate:
    """Create Google provider test data."""
    return ProviderCreate(
        user_id="test-user-123",
        name="Test Google Provider",
        provider_type="google",
        api="https://generativelanguage.googleapis.com",
        key="test-google-api-key-123",
        timeout=60,
        model="gemini-1.5-pro",
        max_tokens=8192,
        temperature=0.8,
        is_system=False,
        provider_config={"safety_settings": []},
    )


@pytest.fixture
def provider_instances(
    openai_provider_data: ProviderCreate,
    anthropic_provider_data: ProviderCreate,
    azure_openai_provider_data: ProviderCreate,
    google_provider_data: ProviderCreate,
) -> list[Provider]:
    """Create provider instances for testing."""
    return [
        Provider(id=uuid4(), **openai_provider_data.model_dump()),
        Provider(id=uuid4(), **anthropic_provider_data.model_dump()),
        Provider(id=uuid4(), **azure_openai_provider_data.model_dump()),
        Provider(id=uuid4(), **google_provider_data.model_dump()),
    ]


@pytest.fixture
def mock_openai_response() -> dict[str, Any]:
    """Create mock OpenAI API response."""
    return {
        "id": "chatcmpl-test-123",
        "object": "chat.completion",
        "created": 1699999999,
        "model": "gpt-4o",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! I'm a test response from OpenAI.",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 15,
            "total_tokens": 25,
        },
    }


@pytest.fixture
def mock_anthropic_response() -> dict[str, Any]:
    """Create mock Anthropic API response."""
    return {
        "id": "msg_test_123",
        "type": "message",
        "role": "assistant",
        "model": "claude-3-5-sonnet-20241022",
        "content": [{"type": "text", "text": "Hello! I'm a test response from Anthropic."}],
        "stop_reason": "end_turn",
        "usage": {
            "input_tokens": 10,
            "output_tokens": 15,
        },
    }


@pytest.fixture
def mock_google_response() -> dict[str, Any]:
    """Create mock Google API response."""
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "Hello! I'm a test response from Google."}],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 15,
            "totalTokenCount": 25,
        },
    }


@pytest.fixture
def mock_http_client():
    """Create a mock HTTP client for API requests."""
    client = AsyncMock()

    # Configure default successful responses
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"mock": "response"}
    response.raise_for_status.return_value = None

    client.post.return_value.__aenter__.return_value = response
    client.get.return_value.__aenter__.return_value = response

    return client


@pytest.fixture
def model_capabilities_registry() -> dict[str, ModelCapabilities]:
    """Create test model capabilities registry."""
    return {
        "gpt-4o": ModelCapabilities(
            supports_temperature=True,
            supports_max_tokens=True,
            supports_tools=True,
            supports_streaming=True,
            supports_system_messages=True,
        ),
        "o1-preview": ModelCapabilities(
            supports_temperature=False,
            supports_max_tokens=False,
            supports_tools=True,
            supports_streaming=False,
            supports_system_messages=False,
        ),
        "claude-3-5-sonnet-20241022": ModelCapabilities(
            supports_temperature=True,
            supports_max_tokens=True,
            supports_tools=True,
            supports_streaming=True,
            supports_system_messages=True,
        ),
        "gemini-1.5-pro": ModelCapabilities(
            supports_temperature=True,
            supports_max_tokens=True,
            supports_tools=True,
            supports_streaming=True,
            supports_system_messages=False,
        ),
    }


@pytest.fixture
def sample_tool_definition() -> dict[str, Any]:
    """Create a sample tool definition for testing."""
    return {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "The unit for temperature",
                    },
                },
                "required": ["location"],
            },
        },
    }


@pytest.fixture
def chat_request_with_tools(
    sample_messages: list[ChatMessage],
    sample_tool_definition: dict[str, Any],
) -> ChatCompletionRequest:
    """Create a chat request with tool definitions."""
    return ChatCompletionRequest(
        messages=sample_messages,
        model="gpt-4o",
        temperature=0.7,
        max_tokens=1000,
        tools=[sample_tool_definition],
        tool_choice="auto",
    )
