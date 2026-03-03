from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from types import TracebackType
from typing import TypedDict, cast
from uuid import UUID, uuid4
from unittest.mock import MagicMock

import pytest
from fastapi import WebSocket, WebSocketDisconnect

from app.api.ws.v1 import chat as chat_ws
from app.middleware.auth import AuthContext


class FakeWebSocket:
    def __init__(self, received_events: list[object]) -> None:
        self._events = list(received_events)
        self.accepted = False
        self.closed: tuple[int | None, str | None] | None = None
        self.query_params: dict[str, str] = {}
        self.sent_texts: list[str] = []
        self.client_state = SimpleNamespace(value=1)

    async def accept(self) -> None:
        self.accepted = True

    async def receive_json(self) -> dict[str, object]:
        if not self._events:
            raise WebSocketDisconnect()
        event = self._events.pop(0)
        if isinstance(event, Exception):
            raise event
        return event  # pyright: ignore[reportReturnType]

    async def close(self, code: int | None = None, reason: str | None = None) -> None:
        self.closed = (code, reason)

    async def send_text(self, message: str) -> None:
        self.sent_texts.append(message)


class DummyDbSession:
    async def commit(self) -> None:
        return

    async def flush(self) -> None:
        return


class DummySessionContext:
    async def __aenter__(self) -> object:
        return DummyDbSession()

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return


class DummyMessage:
    def __init__(self, role: str, content: str) -> None:
        self.id = uuid4()
        self.role = role
        self.content = content
        self.created_at = datetime.now(timezone.utc)

    def model_dump_json(self) -> str:
        return json.dumps(
            {
                "id": str(self.id),
                "role": self.role,
                "content": self.content,
                "created_at": self.created_at.isoformat(),
            }
        )


class DummyMessageRepository:
    def __init__(self, _db: object) -> None:
        self._messages: dict[UUID, DummyMessage] = {}

    async def create_message(self, create: object) -> DummyMessage:
        msg = DummyMessage(role=create.role, content=create.content)  # pyright: ignore[reportAttributeAccessIssue]
        self._messages[msg.id] = msg
        return msg

    async def get_message_with_files(self, message_id: UUID) -> DummyMessage | None:
        return self._messages.get(message_id)

    async def get_messages_by_topic(
        self, _topic_id: UUID, order_by_created: bool = False, limit: int | None = None
    ) -> list[DummyMessage]:
        _ = order_by_created, limit
        return []


class FakePresenceRedis:
    def __init__(self) -> None:
        self.publish_calls: list[tuple[str, str]] = []

    async def publish(self, channel: str, payload: str) -> None:
        self.publish_calls.append((channel, payload))

    async def set(self, *_args: object, **_kwargs: object) -> None:
        return

    async def expire(self, *_args: object, **_kwargs: object) -> None:
        return

    async def delete(self, *_args: object, **_kwargs: object) -> None:
        return

    async def aclose(self) -> None:
        return


class WsDeps(TypedDict):
    session_id: UUID
    topic_id: UUID
    presence_redis: FakePresenceRedis
    process_delay_spy: MagicMock


@pytest.fixture
def patch_ws_dependencies(monkeypatch: pytest.MonkeyPatch) -> WsDeps:
    session_id = uuid4()
    topic_id = uuid4()
    user_id = "test-user-id"

    auth_ctx = AuthContext(
        user_id=user_id,
        auth_provider="bohr_test",
        access_token="test-token",
    )

    async def fake_ws_authenticate_context(_websocket: object, _token: str | None = None) -> AuthContext:
        return auth_ctx

    def fake_session_local() -> DummySessionContext:
        return DummySessionContext()

    class DummyTopicRepository:
        def __init__(self, _db: object) -> None:
            pass

        async def get_topic_with_details(self, _topic_id: UUID) -> object:
            return SimpleNamespace(session_id=session_id, name="Custom Topic")

    class DummySessionRepository:
        def __init__(self, _db: object) -> None:
            pass

        async def get_session_by_id(self, _session_id: UUID) -> object:
            return SimpleNamespace(user_id=user_id, agent_id=None)

    async def fake_redis_listener(_websocket: object, _connection_id: str) -> None:
        return

    class DummyLifecycle:
        async def on_connect(self, _connection_id: str) -> None:
            return

        async def check_before_message(self, _connection_id: str) -> None:
            return

        async def check_balance(self, **_kwargs: object) -> None:
            return

        async def on_disconnect(self, _connection_id: str) -> None:
            return

    async def fake_heartbeat_sender(_websocket: object, _connection_id: str, _presence_redis: object) -> None:
        return

    async def fake_get_chat_lifecycle(_user_id: str, _db: object) -> DummyLifecycle:
        return DummyLifecycle()

    presence_redis = FakePresenceRedis()

    def fake_redis_from_url(*_args: object, **_kwargs: object) -> FakePresenceRedis:
        return presence_redis

    process_delay_spy = MagicMock()
    monkeypatch.setattr(chat_ws.process_chat_message, "delay", process_delay_spy)

    monkeypatch.setattr(chat_ws, "ws_authenticate_context", fake_ws_authenticate_context)
    monkeypatch.setattr(chat_ws, "AsyncSessionLocal", fake_session_local)
    monkeypatch.setattr(chat_ws, "TopicRepository", DummyTopicRepository)
    monkeypatch.setattr(chat_ws, "SessionRepository", DummySessionRepository)
    monkeypatch.setattr(chat_ws, "MessageRepository", DummyMessageRepository)
    monkeypatch.setattr(chat_ws, "redis_listener", fake_redis_listener)
    monkeypatch.setattr(chat_ws, "heartbeat_sender", fake_heartbeat_sender)
    monkeypatch.setattr(chat_ws, "get_chat_lifecycle", fake_get_chat_lifecycle)
    monkeypatch.setattr(chat_ws.redis, "from_url", fake_redis_from_url)

    return {
        "session_id": session_id,
        "topic_id": topic_id,
        "presence_redis": presence_redis,
        "process_delay_spy": process_delay_spy,
    }


@pytest.mark.asyncio
async def test_chat_websocket_publishes_user_echo_loading_and_ack_via_redis(
    patch_ws_dependencies: WsDeps,
) -> None:
    websocket = FakeWebSocket(
        [
            {"message": "hello from phone", "client_id": "client-123"},
            WebSocketDisconnect(),
        ]
    )
    session_id = patch_ws_dependencies["session_id"]
    topic_id = patch_ws_dependencies["topic_id"]

    await chat_ws.chat_websocket(
        websocket=cast(WebSocket, websocket),
        session_id=session_id,
        topic_id=topic_id,
        token="test-token",
    )

    assert websocket.accepted is True
    assert websocket.sent_texts == []

    presence_redis = patch_ws_dependencies["presence_redis"]
    expected_channel = f"chat:{session_id}:{topic_id}"
    assert len(presence_redis.publish_calls) == 3
    assert [channel for channel, _ in presence_redis.publish_calls] == [
        expected_channel,
        expected_channel,
        expected_channel,
    ]

    echo_payload = json.loads(presence_redis.publish_calls[0][1])
    assert echo_payload["role"] == "user"
    assert echo_payload["content"] == "hello from phone"
    assert echo_payload["client_id"] == "client-123"

    loading_payload = json.loads(presence_redis.publish_calls[1][1])
    assert loading_payload["type"] == "loading"
    assert loading_payload["data"]["stream_id"].startswith("stream_")

    ack_payload = json.loads(presence_redis.publish_calls[2][1])
    assert ack_payload["type"] == "message_ack"
    assert ack_payload["data"]["client_id"] == "client-123"
    assert ack_payload["data"]["message_id"] == echo_payload["id"]

    patch_ws_dependencies["process_delay_spy"].assert_called_once()
