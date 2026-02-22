"""
Input schemas for subagent tools.

Pydantic models defining the input parameters for the spawn_subagent tool.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, ValidationError


class SpawnSubagentInput(BaseModel):
    """Input schema for spawn_subagent tool."""

    task: str = Field(
        description=(
            "The task or prompt to give to the subagent. Be specific and complete — the subagent has no prior context."
        ),
    )


class SpawnSubagentOutcome(BaseModel):
    """Structured outcome emitted by spawn_subagent tool."""

    ok: bool = Field(description="Whether subagent execution succeeded.")
    error_code: str | None = Field(
        default=None,
        description="ChatErrorCode-style failure code when ok=false.",
    )
    error_message: str | None = Field(
        default=None,
        description="User-safe failure message when ok=false.",
    )
    output: str = Field(
        default="",
        description="Subagent textual output for successful runs.",
    )
    duration_ms: int = Field(
        default=0,
        ge=0,
        description="Execution time in milliseconds.",
    )


def parse_subagent_outcome(raw_content: Any) -> SpawnSubagentOutcome | None:
    """Best-effort parse of tool content into SpawnSubagentOutcome."""
    payload: Any = raw_content

    if isinstance(raw_content, list) and len(raw_content) == 1:
        payload = raw_content[0]

    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None

    if not isinstance(payload, dict):
        return None

    try:
        return SpawnSubagentOutcome.model_validate(payload)
    except ValidationError:
        return None


__all__ = [
    "SpawnSubagentInput",
    "SpawnSubagentOutcome",
    "parse_subagent_outcome",
]
