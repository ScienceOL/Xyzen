"""LLM chat error codes and helpers."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Tuple


class ErrCode(IntEnum):
    """Shared integer error codes for API and websocket responses."""

    # Generic
    SUCCESS = 0
    UNKNOWN_ERROR = 1
    NO_PERMISSION = 2

    # Request validation (1xxx)
    INVALID_REQUEST = 1000
    EMPTY_MESSAGE = 1001
    MALFORMED_PAYLOAD = 1002

    # Session & topic state (2xxx)
    SESSION_NOT_FOUND = 2000
    TOPIC_NOT_FOUND = 2001
    TOPIC_ACCESS_DENIED = 2002
    AGENT_NOT_BOUND = 2003

    # Provider & model issues (3xxx)
    PROVIDER_NOT_CONFIGURED = 3000
    PROVIDER_NOT_AVAILABLE = 3001
    MODEL_NOT_AVAILABLE = 3002
    PROVIDER_RATE_LIMITED = 3003

    # Tool execution (4xxx)
    TOOL_CONFIRMATION_REQUIRED = 4000
    TOOL_EXECUTION_FAILED = 4001
    TOOL_RESULT_PARSING_FAILED = 4002

    # Streaming lifecycle (5xxx)
    STREAM_INTERRUPTED = 5000
    STREAM_TIMEOUT = 5001
    STREAM_CHANNEL_CLOSED = 5002

    def with_messages(self, *messages: str) -> "ErrCodeError":
        """Return an ErrCodeError containing extra human messages."""

        return ErrCodeError(self, messages)

    def with_errors(self, *errors: BaseException) -> "ErrCodeError":
        """Wrap other exceptions as message payloads for this code."""

        extracted = tuple(str(err) for err in errors if err)
        return ErrCodeError(self, extracted)


@dataclass(slots=True, frozen=True)
class ErrCodeError(Exception):
    """Exception carrying an ErrCode and optional detail strings."""

    code: ErrCode
    messages: Tuple[str, ...] = ()

    def __post_init__(self) -> None:
        cleaned = tuple(msg for msg in self.messages if msg)
        object.__setattr__(self, "messages", cleaned)
        super().__init__(self._format())

    def _format(self) -> str:
        if not self.messages:
            return f"{self.code.name} ({self.code.value})"
        joined = " | ".join(self.messages)
        return f"{self.code.name} ({self.code.value}): {joined}"

    def as_dict(self) -> dict[str, object]:
        """Return a serialisable representation for response payloads."""

        if not self.messages:
            return {"msg": self.code.name.replace("_", " ").title(), "info": []}

        primary, *rest = self.messages
        payload: dict[str, object] = {"msg": primary}
        if rest:
            payload["info"] = rest
        return payload


__all__ = ["ErrCode", "ErrCodeError"]
