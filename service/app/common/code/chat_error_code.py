"""Chat error codes for structured error handling in chat streaming."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from uuid import uuid4

logger = logging.getLogger(__name__)


class ChatErrorCode(StrEnum):
    """Machine-readable error codes for chat streaming errors.

    Format: {category}.{specific_error}
    Frontend uses as i18n key: app.chatError.{code}
    """

    # Provider errors
    PROVIDER_AUTH_FAILED = "provider.auth_failed"
    PROVIDER_RATE_LIMITED = "provider.rate_limited"
    PROVIDER_CONTEXT_TOO_LONG = "provider.context_too_long"
    PROVIDER_UNAVAILABLE = "provider.unavailable"
    PROVIDER_INVALID_RESPONSE = "provider.invalid_response"

    # Content moderation
    CONTENT_FILTERED = "content.filtered"
    CONTENT_UNSAFE = "content.unsafe"

    # Agent execution
    AGENT_EXECUTION_FAILED = "agent.execution_failed"
    AGENT_TIMEOUT = "agent.timeout"
    AGENT_RECURSION_LIMIT = "agent.recursion_limit"

    # Tool execution
    TOOL_EXECUTION_FAILED = "tool.execution_failed"
    TOOL_TIMEOUT = "tool.timeout"
    TOOL_NOT_FOUND = "tool.not_found"

    # Billing
    BILLING_INSUFFICIENT_BALANCE = "billing.insufficient_balance"
    BILLING_SETTLEMENT_FAILED = "billing.settlement_failed"

    # System
    SYSTEM_INTERNAL_ERROR = "system.internal_error"
    SYSTEM_SERVICE_UNAVAILABLE = "system.service_unavailable"

    @property
    def category(self) -> str:
        return self.value.split(".")[0]

    @property
    def user_safe(self) -> bool:
        """Whether the default message is safe to show to users."""
        return self not in (
            ChatErrorCode.SYSTEM_INTERNAL_ERROR,
            ChatErrorCode.SYSTEM_SERVICE_UNAVAILABLE,
        )

    @property
    def recoverable(self) -> bool:
        """Whether the error is potentially recoverable by retrying."""
        return self in (
            ChatErrorCode.PROVIDER_RATE_LIMITED,
            ChatErrorCode.PROVIDER_UNAVAILABLE,
            ChatErrorCode.AGENT_TIMEOUT,
            ChatErrorCode.TOOL_TIMEOUT,
            ChatErrorCode.SYSTEM_SERVICE_UNAVAILABLE,
        )


# Default user-safe messages for each error code
_DEFAULT_MESSAGES: dict[ChatErrorCode, str] = {
    ChatErrorCode.PROVIDER_AUTH_FAILED: "Authentication failed. Please check your API configuration.",
    ChatErrorCode.PROVIDER_RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    ChatErrorCode.PROVIDER_CONTEXT_TOO_LONG: (
        "The conversation is too long for the model to process. "
        "Please try starting a new chat or reducing the number of attached files."
    ),
    ChatErrorCode.PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable. Please try again later.",
    ChatErrorCode.PROVIDER_INVALID_RESPONSE: "Received an invalid response from the AI provider.",
    ChatErrorCode.CONTENT_FILTERED: "Your message was flagged by the content filter. Please rephrase and try again.",
    ChatErrorCode.CONTENT_UNSAFE: "The content was blocked for safety reasons.",
    ChatErrorCode.AGENT_EXECUTION_FAILED: "The agent encountered an error during execution.",
    ChatErrorCode.AGENT_TIMEOUT: "The agent execution timed out.",
    ChatErrorCode.AGENT_RECURSION_LIMIT: "The agent reached its maximum execution steps.",
    ChatErrorCode.TOOL_EXECUTION_FAILED: "A tool call failed during execution.",
    ChatErrorCode.TOOL_TIMEOUT: "A tool call timed out.",
    ChatErrorCode.TOOL_NOT_FOUND: "The requested tool was not found.",
    ChatErrorCode.BILLING_INSUFFICIENT_BALANCE: "Insufficient balance. Please recharge to continue.",
    ChatErrorCode.BILLING_SETTLEMENT_FAILED: "Billing settlement failed. Your message was still processed.",
    ChatErrorCode.SYSTEM_INTERNAL_ERROR: "An internal error occurred. Please try again.",
    ChatErrorCode.SYSTEM_SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
}


@dataclass(frozen=True)
class ClassifiedError:
    """Rich error classification result with debugging metadata."""

    code: ChatErrorCode
    message: str
    error_type: str | None  # Exception class name (only for non-user-safe errors)
    error_ref: str  # Unique reference ID, e.g. "ERR-ABCD1234"
    occurred_at: str  # ISO 8601 timestamp


def classify_exception(e: Exception) -> ClassifiedError:
    """Classify an exception into a ClassifiedError with debugging metadata.

    Returns:
        ClassifiedError with code, message, error_type, error_ref, and occurred_at.
    """
    error_str = str(e).lower()

    if "context_length_exceeded" in error_str or (
        hasattr(e, "code") and getattr(e, "code") == "context_length_exceeded"
    ):
        code = ChatErrorCode.PROVIDER_CONTEXT_TOO_LONG
    elif "content_filter" in error_str or "content_management_policy" in error_str:
        code = ChatErrorCode.CONTENT_FILTERED
    elif "rate_limit" in error_str or "429" in error_str:
        code = ChatErrorCode.PROVIDER_RATE_LIMITED
    elif "authentication" in error_str or "401" in error_str or "403" in error_str:
        code = ChatErrorCode.PROVIDER_AUTH_FAILED
    elif "timeout" in error_str or "timed out" in error_str:
        code = ChatErrorCode.AGENT_TIMEOUT
    elif "recursion limit" in error_str or "recursion_limit" in error_str:
        code = ChatErrorCode.AGENT_RECURSION_LIMIT
    else:
        code = ChatErrorCode.SYSTEM_INTERNAL_ERROR

    error_ref = f"ERR-{uuid4().hex[:8].upper()}"
    occurred_at = datetime.now(timezone.utc).isoformat()
    error_type = type(e).__name__ if not code.user_safe else None

    return ClassifiedError(
        code=code,
        message=_DEFAULT_MESSAGES[code],
        error_type=error_type,
        error_ref=error_ref,
        occurred_at=occurred_at,
    )
