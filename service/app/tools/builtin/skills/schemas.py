"""
Input schemas for skill tools.

Pydantic models defining the input parameters for each skill tool.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ActivateSkillInput(BaseModel):
    """Input schema for activate_skill tool."""

    skill_name: str = Field(
        description=(
            "Name of the skill to activate (e.g. 'xlsx', 'pdf'). "
            "Choose from the <available_skills> list in your instructions."
        )
    )


class ListSkillResourcesInput(BaseModel):
    """Input schema for list_skill_resources tool."""

    skill_name: str = Field(
        description="Name of the activated skill whose resources to list."
    )


__all__ = [
    "ActivateSkillInput",
    "ListSkillResourcesInput",
]
