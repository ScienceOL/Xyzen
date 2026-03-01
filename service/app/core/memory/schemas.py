"""Core Memory schemas for the upgraded memory system.

CoreMemoryBlock is a structured user profile that is always injected
into the system prompt, giving the agent immediate context about the user
without requiring a search.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

CORE_MEMORY_SECTIONS: tuple[str, ...] = (
    "user_summary",
    "preferences",
    "active_context",
    "working_rules",
)


class CoreMemoryBlock(BaseModel):
    """Structured user profile stored as a single document in the memory store.

    Each section is ~500 chars, total ~2000 chars / ~500 tokens.
    Stored in namespace ("core_memory", "{user_id}") with key "profile".
    """

    user_summary: str = Field(
        default="",
        max_length=500,
        description="Who is this user? Name, role, expertise, background.",
    )
    preferences: str = Field(
        default="",
        max_length=500,
        description="Communication style, language preferences, formatting, tool preferences.",
    )
    active_context: str = Field(
        default="",
        max_length=500,
        description="Current projects, goals, ongoing topics, recent decisions.",
    )
    working_rules: str = Field(
        default="",
        max_length=500,
        description="Explicit rules and constraints the agent learned from past interactions.",
    )

    def is_empty(self) -> bool:
        """Return True if all sections are empty or whitespace."""
        return not any(getattr(self, section).strip() for section in CORE_MEMORY_SECTIONS)

    def to_prompt_text(self) -> str:
        """Render as XML block for system prompt injection."""
        parts: list[str] = []
        for section in CORE_MEMORY_SECTIONS:
            value = getattr(self, section).strip()
            if value:
                escaped = _escape_xml(value)
                parts.append(f"  <{section}>{escaped}</{section}>")
        if not parts:
            return ""
        inner = "\n".join(parts)
        return f"<CORE_MEMORY>\n{inner}\n</CORE_MEMORY>"


def _escape_xml(text: str) -> str:
    """Escape XML-special characters to prevent prompt injection."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
