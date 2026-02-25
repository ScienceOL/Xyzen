"""
Input schemas for skill management tools.

NOTE: Avoid `X | None` (Optional) fields here. Google Gemini's tool schema
converter (`langchain_google_genai`) cannot handle the `anyOf` JSON Schema
pattern that Pydantic generates for union types. Use sentinel defaults instead
(empty string / 0) and map them to None in the tool function.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateSkillInput(BaseModel):
    """Input schema for create_skill tool."""

    name: str = Field(
        description="Skill name (lowercase letters, digits, hyphens; must start with a letter, e.g. 'my-skill').",
    )
    description: str = Field(
        description="Short description of what the skill does (max 1024 characters).",
    )
    skill_md: str = Field(
        description=(
            "Full SKILL.md content with YAML frontmatter (--- name/description ---) "
            "followed by instruction body in Markdown."
        ),
    )
    resources: str = Field(
        default="",
        description=(
            'JSON array of resource files, e.g. \'[{"path":"scripts/run.py","content":"..."}]\'. '
            "Leave empty if no resources are needed."
        ),
    )


class UpdateSkillInput(BaseModel):
    """Input schema for update_skill tool."""

    skill_name: str = Field(
        description="Name of the skill to update (case-insensitive lookup among your own skills).",
    )
    skill_md: str = Field(
        default="",
        description="New SKILL.md content. Leave empty to keep the current SKILL.md unchanged.",
    )
    description: str = Field(
        default="",
        description="New description. Leave empty to keep the current description unchanged.",
    )
    resources: str = Field(
        default="",
        description=(
            'JSON array of resource files to replace existing resources, e.g. \'[{"path":"scripts/run.py","content":"..."}]\'. '
            "Leave empty to keep existing resources unchanged."
        ),
    )


class DeleteSkillInput(BaseModel):
    """Input schema for delete_skill tool."""

    skill_name: str = Field(
        description="Name of the skill to delete (case-insensitive lookup among your own skills).",
    )


class ListSkillsInput(BaseModel):
    """Input schema for list_skills tool."""

    pass


class GetSkillDetailInput(BaseModel):
    """Input schema for get_skill_detail tool."""

    skill_name: str = Field(
        description="Name of the skill to get details for (case-insensitive lookup).",
    )
