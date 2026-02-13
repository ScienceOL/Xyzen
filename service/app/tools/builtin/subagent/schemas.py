"""
Input schemas for subagent tools.

Pydantic models defining the input parameters for the spawn_subagent tool.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SpawnSubagentInput(BaseModel):
    """Input schema for spawn_subagent tool."""

    task: str = Field(
        description=(
            "The task or prompt to give to the subagent. "
            "Be specific and complete — the subagent has no prior context."
        ),
    )


__all__ = [
    "SpawnSubagentInput",
]
