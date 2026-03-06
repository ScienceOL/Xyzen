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
    PROVIDER_QUOTA_EXHAUSTED = "provider.quota_exhausted"
    PROVIDER_TIMEOUT = "provider.timeout"

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
            ChatErrorCode.PROVIDER_QUOTA_EXHAUSTED,
        )

    @property
    def recoverable(self) -> bool:
        """Whether the error is potentially recoverable by retrying."""
        return self in (
            ChatErrorCode.PROVIDER_RATE_LIMITED,
            ChatErrorCode.PROVIDER_UNAVAILABLE,
            ChatErrorCode.PROVIDER_QUOTA_EXHAUSTED,
            ChatErrorCode.PROVIDER_TIMEOUT,
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
    ChatErrorCode.PROVIDER_QUOTA_EXHAUSTED: "The AI service provider encountered an internal error. Please try again later.",
    ChatErrorCode.PROVIDER_TIMEOUT: "The upstream LLM provider timed out. This is a service-side issue, not an agent error. Please try again.",
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


_PROVIDER_TIMEOUT_TYPES = {
    "ReadTimeout",
    "ReadTimeoutError",
    "ConnectTimeout",
    "ConnectTimeoutError",
    "APITimeoutError",  # openai
    "ServerTimeoutError",  # aiohttp
    "ResponseNotRead",  # httpx
}

_PROVIDER_TIMEOUT_PATTERNS = (
    "connectionpool",
    "read timed out",
    "connect timed out",
    "bedrock-runtime",
    "endpoint_url",
)


def _is_provider_timeout(e: Exception) -> bool:
    """Check if the exception is an HTTP/provider-level timeout (not an agent timeout).

    Provider timeouts come from HTTP libraries (urllib3, httpx, botocore, aiohttp)
    when the LLM service fails to respond.  Agent timeouts come from asyncio.wait_for
    wrapping agent execution (e.g. subagent 30-min timeout).

    Walks the full exception chain (__cause__ / __context__) because LangChain and
    LangGraph often wrap the original transport-level error.
    """
    # Walk the exception chain: e -> e.__cause__ -> e.__cause__.__cause__ ...
    current: BaseException | None = e
    while current is not None:
        exc_type = type(current).__name__
        if exc_type in _PROVIDER_TIMEOUT_TYPES:
            return True

        try:
            import httpx

            if isinstance(current, httpx.TimeoutException):
                return True
        except ImportError:
            pass

        error_str = str(current).lower()
        if any(pattern in error_str for pattern in _PROVIDER_TIMEOUT_PATTERNS):
            return True

        # Move to the next exception in the chain (prefer explicit cause)
        next_exc = current.__cause__ or current.__context__
        if next_exc is current:
            break
        current = next_exc

    return False


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
    elif ("timeout" in error_str or "timed out" in error_str) and _is_provider_timeout(e):
        code = ChatErrorCode.PROVIDER_TIMEOUT
    elif "timeout" in error_str or "timed out" in error_str:
        code = ChatErrorCode.AGENT_TIMEOUT
    elif "recursion limit" in error_str or "recursion_limit" in error_str:
        code = ChatErrorCode.AGENT_RECURSION_LIMIT
    elif "没有可用token" in str(e):
        code = ChatErrorCode.PROVIDER_QUOTA_EXHAUSTED
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
