# """
# Integration tests for async chat with Celery task processing.

# Tests the Celery task dispatch functionality with mocked dependencies.
# """

# from __future__ import annotations

# import json
# from types import TracebackType
# from typing import TYPE_CHECKING, Any, Generator
# from unittest.mock import MagicMock, patch
# from uuid import UUID, uuid4

# import pytest
# from fastapi import WebSocket
# from fastapi.testclient import TestClient
# from sqlmodel.ext.asyncio.session import AsyncSession

# from app.main import app
# from app.middleware.auth import AuthContext, get_auth_context_websocket

# if TYPE_CHECKING:
#     from collections.abc import Sequence

#     from app.models.message import Message


# @pytest.fixture
# def mock_redis_listener() -> Generator[None, None, None]:
#     """
#     Mock the redis_listener to prevent it from blocking.
#     The listener runs in the background and can cause test hangs.
#     """

#     async def mock_listener(websocket: WebSocket, connection_id: str) -> None:
#         # Do nothing - just exit immediately
#         pass

#     with patch("app.api.ws.v1.chat.redis_listener", mock_listener):
#         yield


# @pytest.fixture
# def mock_celery_task() -> Generator[MagicMock, None, None]:
#     """Mock the Celery task dispatch."""
#     with patch("app.api.ws.v1.chat.process_chat_message") as mock_task:
#         mock_task.delay = MagicMock()
#         yield mock_task


# @pytest.fixture
# def mock_auth_dependency() -> Generator[None, None, None]:
#     """Override the WebSocket auth dependency."""
#     original_overrides = app.dependency_overrides.copy()

#     async def mock_get_auth_context() -> AuthContext:
#         return AuthContext(user_id="test-user-id", auth_provider="bohr_test", access_token="test_token")

#     app.dependency_overrides[get_auth_context_websocket] = mock_get_auth_context
#     yield
#     app.dependency_overrides = original_overrides


# @pytest.fixture
# def mock_db_session_factory(db_session: AsyncSession) -> Generator[MagicMock, None, None]:
#     """
#     Patch AsyncSessionLocal to return the test's db_session.
#     """

#     class MockSessionContext:
#         async def __aenter__(self) -> AsyncSession:
#             return db_session

#         async def __aexit__(
#             self,
#             exc_type: type[BaseException] | None,
#             exc_val: BaseException | None,
#             exc_tb: TracebackType | None,
#         ) -> None:
#             pass

#     with patch("app.api.ws.v1.chat.AsyncSessionLocal") as mock_factory:
#         mock_factory.return_value = MockSessionContext()
#         yield mock_factory


# @pytest.fixture
# def mock_consume() -> Generator[MagicMock, None, None]:
#     """Mock the consume function to avoid balance checks."""
#     with patch("app.api.ws.v1.chat.create_consume_for_chat") as mock_consume_fn:
#         mock_consume_fn.return_value = MagicMock(id=uuid4())
#         yield mock_consume_fn


# @pytest.mark.integration
# def test_chat_websocket_dispatches_celery_task(
#     db_session: AsyncSession,
#     mock_redis_listener: None,
#     mock_celery_task: MagicMock,
#     mock_auth_dependency: None,
#     mock_db_session_factory: MagicMock,
#     mock_consume: MagicMock,
# ) -> None:
#     """
#     Test that the WebSocket handler correctly dispatches a Celery task
#     when receiving a chat message.
#     """
#     import asyncio

#     from app.models.sessions import Session
#     from app.models.topic import Topic

#     user_id = "test-user-id"

#     async def setup_db() -> tuple[Session, Topic]:
#         session = Session(user_id=user_id, name="Test Session")
#         db_session.add(session)
#         await db_session.commit()
#         await db_session.refresh(session)

#         topic = Topic(session_id=session.id, name="Test Topic")
#         db_session.add(topic)
#         await db_session.commit()
#         await db_session.refresh(topic)

#         return session, topic

#     # Run async setup
#     loop = asyncio.new_event_loop()
#     try:
#         session, topic = loop.run_until_complete(setup_db())
#     finally:
#         loop.close()

#     session_id_str = str(session.id)
#     topic_id_str = str(topic.id)

#     # Use TestClient for synchronous WebSocket test
#     with TestClient(app) as client:
#         with client.websocket_connect(
#             f"/xyzen/ws/v1/chat/sessions/{session_id_str}/topics/{topic_id_str}"
#         ) as websocket:
#             # Send a user message
#             websocket.send_json({"type": "message", "message": "Hello AI", "context": {}})

#             # Receive echoed user message
#             response1 = websocket.receive_text()
#             msg1: dict[str, Any] = json.loads(response1)

#             # Verify we got the user message back (might be full message object or just content)
#             assert msg1.get("role") == "user" or msg1.get("content") == "Hello AI" or "Hello AI" in response1

#             # Receive loading message
#             response2 = websocket.receive_text()
#             msg2: dict[str, Any] = json.loads(response2)
#             assert msg2.get("type") == "loading"

#     # Verify Celery task was called with correct parameters
#     assert mock_celery_task.delay.called, "Celery task should be dispatched"
#     call_kwargs: dict[str, Any] = mock_celery_task.delay.call_args.kwargs
#     assert call_kwargs["message_text"] == "Hello AI"
#     assert call_kwargs["session_id_str"] == session_id_str
#     assert call_kwargs["topic_id_str"] == topic_id_str
#     assert call_kwargs["user_id_str"] == user_id
#     assert call_kwargs["auth_provider"] == "bohr_test"


# @pytest.mark.integration
# def test_chat_websocket_saves_user_message(
#     db_session: AsyncSession,
#     mock_redis_listener: None,
#     mock_celery_task: MagicMock,
#     mock_auth_dependency: None,
#     mock_db_session_factory: MagicMock,
#     mock_consume: MagicMock,
# ) -> None:
#     """
#     Test that the WebSocket handler saves the user message to the database.
#     """
#     import asyncio

#     from sqlmodel import select

#     from app.models.message import Message
#     from app.models.sessions import Session
#     from app.models.topic import Topic

#     user_id = "test-user-id"

#     async def setup_db() -> tuple[Session, Topic]:
#         session = Session(user_id=user_id, name="Test Session 2")
#         db_session.add(session)
#         await db_session.commit()
#         await db_session.refresh(session)

#         topic = Topic(session_id=session.id, name="Test Topic 2")
#         db_session.add(topic)
#         await db_session.commit()
#         await db_session.refresh(topic)

#         return session, topic

#     async def get_messages(topic_id: UUID) -> Sequence[Message]:
#         result = await db_session.exec(select(Message).where(Message.topic_id == topic_id))
#         return result.all()

#     loop = asyncio.new_event_loop()
#     try:
#         session, topic = loop.run_until_complete(setup_db())
#     finally:
#         loop.close()

#     session_id_str = str(session.id)
#     topic_id_str = str(topic.id)

#     with TestClient(app) as client:
#         with client.websocket_connect(
#             f"/xyzen/ws/v1/chat/sessions/{session_id_str}/topics/{topic_id_str}"
#         ) as websocket:
#             websocket.send_json({"type": "message", "message": "Test message", "context": {}})
#             # Consume the responses
#             websocket.receive_text()
#             websocket.receive_text()

#     # Verify user message was saved
#     loop2 = asyncio.new_event_loop()
#     try:
#         messages = loop2.run_until_complete(get_messages(topic.id))
#     finally:
#         loop2.close()

#     assert len(messages) >= 1
#     user_messages = [m for m in messages if m.role == "user"]
#     assert len(user_messages) == 1
#     assert user_messages[0].content == "Test message"
