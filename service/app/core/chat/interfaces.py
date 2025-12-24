from typing import Protocol, runtime_checkable


@runtime_checkable
class ChatPublisher(Protocol):
    """
    Protocol for sending chat messages to a client.
    Implemented by ConnectionManager (WebSocket) and RedisPublisher (Celery/Redis).
    """

    async def send_personal_message(self, message: str, connection_id: str) -> None: ...
