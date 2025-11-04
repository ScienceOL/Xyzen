"""
Pytest configuration and shared fixtures for Xyzen service tests.
"""

import asyncio
import os
from collections.abc import AsyncGenerator, Generator
from typing import Any, Callable
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from core.providers.base import (
    BaseLLMProvider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
)
from middleware.database.connection import get_session
from models.provider import Provider, ProviderCreate


# Test database configuration
TEST_DATABASE_URL = "sqlite+aiosqlite:///test_database.db"
TEST_SYNC_DATABASE_URL = "sqlite:///test_database.db"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create an async database engine for testing."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest.fixture
def sync_engine():
    """Create a sync database engine for testing."""
    engine = create_engine(
        TEST_SYNC_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for testing."""
    connection = await async_engine.connect()
    transaction = await connection.begin()

    session = AsyncSession(bind=connection)

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest.fixture
def override_get_session(db_session: AsyncSession) -> Callable[[], AsyncGenerator[AsyncSession, None]]:
    """Override the database session dependency."""

    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    return _override_get_session


@pytest.fixture
def test_client(
    override_get_session: Callable[[], AsyncGenerator[AsyncSession, None]],
) -> Generator[TestClient, None, None]:
    """Create a test client with mocked database session."""
    app.dependency_overrides[get_session] = override_get_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def async_client(
    override_get_session: Callable[[], AsyncGenerator[AsyncSession, None]],
) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with mocked database session."""
    app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


# Mock Provider for testing
class MockLLMProvider(BaseLLMProvider):
    """Mock LLM provider for testing."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            api_key=SecretStr("test-key"),
            api_endpoint="https://mock-api.test/v1",
            model="mock-model",
            **kwargs,
        )

    def _convert_messages(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        """Convert messages to mock format."""
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """Mock chat completion."""
        return ChatCompletionResponse(
            content="Mock response for testing",
            finish_reason="stop",
            usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        )

    def is_available(self) -> bool:
        """Mock availability check."""
        return True

    @property
    def provider_name(self) -> str:
        """Mock provider name."""
        return "mock"

    @property
    def supported_models(self) -> list[str]:
        """Mock supported models."""
        return ["mock-model", "mock-model-2"]

    def to_langchain_model(self) -> Any:
        """Mock LangChain conversion."""
        raise NotImplementedError("Mock provider doesn't support LangChain")


@pytest.fixture
def mock_provider() -> MockLLMProvider:
    """Create a mock LLM provider for testing."""
    return MockLLMProvider()


@pytest.fixture
def sample_provider_data() -> ProviderCreate:
    """Create sample provider data for testing."""
    return ProviderCreate(
        user_id="test-user-123",
        name="Test OpenAI Provider",
        provider_type="openai",
        api="https://api.openai.com/v1",
        key="sk-test-key-123",
        timeout=60,
        model="gpt-4o",
        max_tokens=4096,
        temperature=0.7,
        is_system=False,
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


# Async test markers
pytest_plugins = ("pytest_asyncio",)
