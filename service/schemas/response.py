"""Response envelopes shared across HTTP and websocket endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from common.code.error_code import ErrCode, ErrCodeError

T = TypeVar("T")


def _utc_timestamp() -> int:
    return int(datetime.now(timezone.utc).timestamp())


class ErrorPayload(BaseModel):
    """Standardised error payload for API and websocket responses."""

    msg: str
    info: List[str] = Field(default_factory=list)


class ResponseEnvelope(BaseModel, Generic[T]):
    """Generic response wrapper mirroring the Go Resp type."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    code: ErrCode = Field(default=ErrCode.SUCCESS, description="Error code for the response")
    error_detail: Optional[ErrorPayload] = Field(
        default=None, serialization_alias="error", description="Present only when code != SUCCESS"
    )
    data: Optional[T] = Field(default=None, description="Optional payload")
    timestamp: int = Field(default_factory=_utc_timestamp, description="UTC timestamp (seconds)")

    @classmethod
    def success(cls, data: T | None = None) -> ResponseEnvelope[T]:
        """Create a success response."""
        return cls(code=ErrCode.SUCCESS, data=data)

    @classmethod
    def error(cls, code: ErrCode, message: str, info: List[str] | None = None) -> ResponseEnvelope[Any]:
        """Create an error response with explicit code and message."""
        payload = ErrorPayload(msg=message, info=info or [])
        return cls(code=code, error_detail=payload, data=None)

    @classmethod
    def from_exception(cls, err: ErrCodeError) -> ResponseEnvelope[Any]:
        """Create an error response from ErrCodeError exception."""
        if err.messages:
            msg, *extra = err.messages
            info_values = [str(entry) for entry in extra]
            primary_msg = str(msg)
        else:
            primary_msg = err.code.name.replace("_", " ").title()
            info_values = []
        payload = ErrorPayload(msg=primary_msg, info=info_values)
        return cls(code=err.code, error_detail=payload, data=None)


class WSMetadata(BaseModel):
    """Minimal metadata for websocket payload routing."""

    action: str
    message_id: Optional[str] = None


class WSData(BaseModel, Generic[T]):
    """Websocket data structure matching the Go WSData generic type."""

    meta: WSMetadata
    data: Optional[T] = None


class WSResponse(ResponseEnvelope[WSData[T]], Generic[T]):
    """Response envelope specialised for websocket messages."""

    pass


__all__ = [
    "ErrorPayload",
    "ResponseEnvelope",
    "WSMetadata",
    "WSData",
    "WSResponse",
]
