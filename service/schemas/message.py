from typing import Any

from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Standardized chat message format."""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """Standardized chat completion request format."""

    messages: list[ChatMessage]
    model: str
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None


class ChatCompletionResponse(BaseModel):
    """Standardized chat completion response format."""

    content: str | None
    tool_calls: list[dict[str, Any]] | None = None
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None
