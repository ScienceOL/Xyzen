from types import TracebackType
from types import SimpleNamespace
from typing import TypedDict, cast
from uuid import UUID, uuid4

import pytest
from fastapi import WebSocket, WebSocketDisconnect
from unittest.mock import AsyncMock

from app.api.ws.v1 import chat as chat_ws
from app.middleware.auth import AuthContext


class FakeWebSocket:
    def __init__(self, received_events: list[object]) -> None:
        self._events = list(received_events)
        self.accepted = False
        self.closed: tuple[int | None, str | None] | None = None

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

    async def send_text(self, _message: str) -> None:
        return


class DummySessionContext:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return


class WsDeps(TypedDict):
    session_id: UUID
    topic_id: UUID
    auth_ctx: AuthContext


@pytest.fixture
def patch_ws_dependencies(monkeypatch: pytest.MonkeyPatch) -> WsDeps:
    session_id = uuid4()
    topic_id = uuid4()
    user_id = "test-user-id"

    def fake_session_local() -> DummySessionContext:
        return DummySessionContext()

    class DummyTopicRepository:
        def __init__(self, _db: object) -> None:
            pass

        async def get_topic_with_details(self, _topic_id: UUID) -> object:
            return SimpleNamespace(session_id=session_id)

    class DummySessionRepository:
        def __init__(self, _db: object) -> None:
            pass

        async def get_session_by_id(self, _session_id: UUID) -> object:
            return SimpleNamespace(user_id=user_id)

    async def fake_redis_listener(_websocket: object, _connection_id: str) -> None:
        return

    monkeypatch.setattr(chat_ws, "AsyncSessionLocal", fake_session_local)
    monkeypatch.setattr(chat_ws, "TopicRepository", DummyTopicRepository)
    monkeypatch.setattr(chat_ws, "SessionRepository", DummySessionRepository)
    monkeypatch.setattr(chat_ws, "redis_listener", fake_redis_listener)

    return {
        "session_id": session_id,
        "topic_id": topic_id,
        "auth_ctx": AuthContext(
            user_id=user_id,
            auth_provider="bohr_test",
            access_token="test-token",
        ),
    }


@pytest.mark.asyncio
async def test_chat_websocket_abort_event_sets_abort_signal(
    monkeypatch: pytest.MonkeyPatch,
    patch_ws_dependencies: WsDeps,
) -> None:
    abort_spy = AsyncMock()
    monkeypatch.setattr(chat_ws, "set_abort_signal", abort_spy)

    websocket = FakeWebSocket([{"type": "abort"}, WebSocketDisconnect()])
    session_id = patch_ws_dependencies["session_id"]
    topic_id = patch_ws_dependencies["topic_id"]
    auth_ctx = patch_ws_dependencies["auth_ctx"]

    await chat_ws.chat_websocket(
        websocket=cast(WebSocket, websocket),
        session_id=session_id,
        topic_id=topic_id,
        auth_ctx=auth_ctx,
    )

    assert websocket.accepted is True
    abort_spy.assert_awaited_once_with(f"{session_id}:{topic_id}")


@pytest.mark.asyncio
async def test_chat_websocket_disconnect_does_not_set_abort_signal(
    monkeypatch: pytest.MonkeyPatch,
    patch_ws_dependencies: WsDeps,
) -> None:
    abort_spy = AsyncMock()
    monkeypatch.setattr(chat_ws, "set_abort_signal", abort_spy)

    websocket = FakeWebSocket([WebSocketDisconnect()])
    session_id = patch_ws_dependencies["session_id"]
    topic_id = patch_ws_dependencies["topic_id"]
    auth_ctx = patch_ws_dependencies["auth_ctx"]

    await chat_ws.chat_websocket(
        websocket=cast(WebSocket, websocket),
        session_id=session_id,
        topic_id=topic_id,
        auth_ctx=auth_ctx,
    )

    assert websocket.accepted is True
    abort_spy.assert_not_awaited()
