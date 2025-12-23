import os
from uuid import uuid4

import pytest

from app.models.provider import Provider, ProviderCreate
from app.schemas.message import ChatCompletionRequest, ChatMessage
from app.schemas.provider import ProviderScope, ProviderType


@pytest.fixture
def sample_provider_data() -> ProviderCreate:
    """Create sample provider data for testing."""
    return ProviderCreate(
        scope=ProviderScope.SYSTEM,
        user_id="test-user-123",
        name="Test OpenAI Provider",
        provider_type=ProviderType.OPENAI,
        api="https://api.openai.com/v1",
        key="sk-test-key-123",
        timeout=60,
        model="gpt-4o",
        max_tokens=4096,
        temperature=0.7,
        provider_config={"organization": "test-org"},
    )


@pytest.fixture
def sample_provider(sample_provider_data: ProviderCreate) -> Provider:
    """Create a sample provider instance for testing."""
    return Provider(id=uuid4(), **sample_provider_data.model_dump())


@pytest.fixture
def sample_messages() -> list[ChatMessage]:
    """Create sample chat messages for testing."""
    return [
        ChatMessage(role="system", content="You are a helpful assistant."),
        ChatMessage(role="user", content="Hello, how are you?"),
        ChatMessage(role="assistant", content="I'm doing well, thank you for asking!"),
    ]


@pytest.fixture
def sample_chat_request(sample_messages: list[ChatMessage]) -> ChatCompletionRequest:
    """Create a sample chat completion request for testing."""
    return ChatCompletionRequest(
        messages=sample_messages,
        model="gpt-4o",
        temperature=0.7,
        max_tokens=1000,
    )


# Environment setup
@pytest.fixture(autouse=True)
def setup_test_environment():
    """Set up test environment variables."""
    # We use a dummy URL for SQLite tests, but keep the fixture for other env vars
    TEST_DATABASE_URL = "sqlite+aiosqlite:///test_database.db"

    os.environ.update(
        {
            "TESTING": "true",
            "DATABASE_URL": TEST_DATABASE_URL,
            "SECRET_KEY": "test-secret-key",
            "OPENAI_API_KEY": "test-openai-key",
            "ANTHROPIC_API_KEY": "test-anthropic-key",
            "GOOGLE_API_KEY": "test-google-key",
        }
    )
    yield
    # Cleanup
    for key in [
        "TESTING",
        "DATABASE_URL",
        "SECRET_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
    ]:
        os.environ.pop(key, None)
