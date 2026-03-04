"""Context window management for chat conversations.

Provides token estimation, context budget tracking, and history truncation
to prevent exceeding LLM context window limits.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from langchain_core.messages import BaseMessage, HumanMessage

if TYPE_CHECKING:
    from app.core.providers.manager import UserProviderManager

logger = logging.getLogger(__name__)

# Fallback context window size when model info is unavailable
DEFAULT_MAX_INPUT_TOKENS = 128_000

# Approximate characters per token for estimation
CHARS_PER_TOKEN = 3.5

# Budget thresholds (as fractions of max_input_tokens)
WARNING_THRESHOLD = 0.70
CRITICAL_THRESHOLD = 0.90

# When truncating, keep messages that fit within this fraction of budget
TRUNCATION_TARGET = 0.60


@dataclass(frozen=True)
class ContextBudget:
    """Token budget derived from model context window."""

    max_input_tokens: int
    warning_threshold: int
    critical_threshold: int

    @classmethod
    def from_max_tokens(cls, max_input_tokens: int) -> ContextBudget:
        return cls(
            max_input_tokens=max_input_tokens,
            warning_threshold=int(max_input_tokens * WARNING_THRESHOLD),
            critical_threshold=int(max_input_tokens * CRITICAL_THRESHOLD),
        )


def _extract_text_content(content: object) -> str:
    """Extract text from message content (handles str and multimodal lists)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text", "")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts)
    return str(content)


def estimate_message_tokens(messages: list[BaseMessage]) -> int:
    """Approximate token count using character-based heuristic.

    Uses ~3.5 characters per token as a rough estimate. This is intentionally
    conservative (over-estimates) to provide safety margin.
    """
    total_chars = 0
    for msg in messages:
        total_chars += len(_extract_text_content(msg.content))
        # Account for role/metadata overhead (~4 tokens per message)
        total_chars += 14  # ~4 tokens * 3.5 chars/token
    return int(total_chars / CHARS_PER_TOKEN)


async def get_context_budget(
    model_name: str,
    provider_id: str | None = None,
) -> ContextBudget:
    """Get context budget for a model using ModelsDevService.

    Falls back to DEFAULT_MAX_INPUT_TOKENS if model info is unavailable.
    """
    from app.core.model_registry.service import ModelsDevService

    model_info = await ModelsDevService.get_model_info_for_key(
        model_id=model_name,
        provider_id=provider_id,
    )
    max_tokens = model_info.max_input_tokens if model_info else DEFAULT_MAX_INPUT_TOKENS
    return ContextBudget.from_max_tokens(max_tokens)


def truncate_history_if_needed(
    messages: list[BaseMessage],
    budget: ContextBudget,
) -> list[BaseMessage]:
    """Truncate oldest messages if estimated tokens exceed critical threshold.

    Keeps the first message (system/initial context) and the most recent
    messages that fit within TRUNCATION_TARGET of the budget.

    Returns the original list unchanged if under the critical threshold.
    """
    estimated = estimate_message_tokens(messages)
    if estimated <= budget.critical_threshold:
        return messages

    if len(messages) <= 2:
        return messages

    target_tokens = int(budget.max_input_tokens * TRUNCATION_TARGET)
    first_msg = messages[0]
    remaining = messages[1:]

    # Walk backwards from most recent, accumulating tokens
    kept: list[BaseMessage] = []
    accumulated = estimate_message_tokens([first_msg])
    for msg in reversed(remaining):
        msg_tokens = estimate_message_tokens([msg])
        if accumulated + msg_tokens > target_tokens:
            break
        kept.append(msg)
        accumulated += msg_tokens

    kept.reverse()
    truncated_count = len(messages) - 1 - len(kept)
    logger.warning(
        "Context truncation: %d tokens estimated (critical: %d). Dropped %d oldest messages, keeping %d.",
        estimated,
        budget.critical_threshold,
        truncated_count,
        len(kept) + 1,
    )
    return [first_msg, *kept]


COMPACTION_PROMPT = (
    "You are summarizing a conversation for continuation in a new chat. "
    "Create a comprehensive handoff summary including:\n"
    "1. The user's original request and intent\n"
    "2. Key decisions made and their rationale\n"
    "3. Important context, constraints, or preferences expressed\n"
    "4. Current progress and what remains to be done\n"
    "5. Any critical data, file references, or technical details needed to continue\n\n"
    "Be concise but thorough. The next conversation will start with this summary as context. "
    "Write the summary in the same language the user used."
)


async def generate_conversation_summary(
    messages: list[BaseMessage],
    user_id: str,
    user_provider_manager: "UserProviderManager",
    model_tier: str | None = None,
) -> str:
    """Generate a summary of a conversation for compaction.

    When *model_tier* is provided the fallback model for that tier is used,
    so compaction quality matches what the session is configured for.
    Falls back to the lightweight helper model when no tier is specified.
    """
    if model_tier:
        from app.schemas.model_tier import ModelTier, get_fallback_model_for_tier

        candidate = get_fallback_model_for_tier(ModelTier(model_tier))
        model = candidate.model
        provider = candidate.provider_type
        tier_value = model_tier
    else:
        from app.schemas.model_tier import get_topic_rename_config

        model, provider = get_topic_rename_config()
        tier_value = "standard"

    llm = await user_provider_manager.create_langchain_model(
        provider_id=provider,
        model=model,
    )

    # Build the summary request: compaction prompt + conversation messages
    conversation_text = "\n".join(f"[{msg.type}]: {_extract_text_content(msg.content)}" for msg in messages)
    prompt = f"{COMPACTION_PROMPT}\n\n---\n\n{conversation_text}"
    response = await llm.ainvoke([HumanMessage(content=prompt)])

    from app.core.consume.consume_service import record_response_usage_direct

    await record_response_usage_direct(
        response,
        user_id=user_id,
        source="helper:context_compaction",
        model_name=model,
        provider_id=str(provider),
        model_tier=tier_value,
    )

    content = response.content
    return content if isinstance(content, str) else str(content)
