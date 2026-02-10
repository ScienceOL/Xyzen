"""
SKILL.md parser and validator.

Parses YAML frontmatter + markdown body from SKILL.md files.
Validates name, description, and optional resource listings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import yaml


# Validation constants
NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
NAME_MAX_LENGTH = 64
DESCRIPTION_MAX_LENGTH = 1024


@dataclass
class ParsedSkill:
    """Result of parsing a SKILL.md file."""

    name: str
    description: str
    instructions: str  # Markdown body (after frontmatter)
    license: str | None = None
    compatibility: str | None = None
    metadata: dict[str, str] | None = None
    resources: list[dict[str, str]] = field(default_factory=list)


class SkillParseError(ValueError):
    """Raised when SKILL.md parsing or validation fails."""

    pass


def validate_skill_name(name: str) -> str:
    """
    Validate a skill name.

    Rules:
    - Lowercase letters, digits, hyphens only
    - Must start with a letter
    - No consecutive hyphens
    - No leading/trailing hyphens
    - 1-64 characters

    Args:
        name: The skill name to validate.

    Returns:
        The validated name (unchanged).

    Raises:
        SkillParseError: If validation fails.
    """
    if not name:
        raise SkillParseError("Skill name is required")

    if len(name) > NAME_MAX_LENGTH:
        raise SkillParseError(f"Skill name must be at most {NAME_MAX_LENGTH} characters, got {len(name)}")

    if "--" in name:
        raise SkillParseError("Skill name must not contain consecutive hyphens")

    if not NAME_PATTERN.match(name):
        raise SkillParseError(
            f"Skill name must be lowercase letters, digits, and hyphens, "
            f"starting with a letter: {name!r}"
        )

    return name


def _validate_description(description: str) -> str:
    """Validate skill description."""
    if not description or not description.strip():
        raise SkillParseError("Skill description is required and must not be empty")

    if len(description) > DESCRIPTION_MAX_LENGTH:
        raise SkillParseError(
            f"Skill description must be at most {DESCRIPTION_MAX_LENGTH} characters, "
            f"got {len(description)}"
        )

    return description.strip()


def _split_frontmatter(content: str) -> tuple[dict[str, object], str]:
    """
    Split SKILL.md into YAML frontmatter dict and markdown body.

    Expects the format:
        ---
        name: my-skill
        description: Does something
        ---
        # Instructions here...

    Returns:
        Tuple of (frontmatter dict, markdown body).

    Raises:
        SkillParseError: If frontmatter is missing or malformed.
    """
    content = content.strip()

    if not content.startswith("---"):
        raise SkillParseError("SKILL.md must start with YAML frontmatter (---)")

    # Find the closing ---
    second_fence = content.find("---", 3)
    if second_fence == -1:
        raise SkillParseError("SKILL.md frontmatter is not closed (missing second ---)")

    frontmatter_raw = content[3:second_fence].strip()
    body = content[second_fence + 3 :].strip()

    try:
        frontmatter = yaml.safe_load(frontmatter_raw)
    except yaml.YAMLError as e:
        raise SkillParseError(f"Invalid YAML frontmatter: {e}") from e

    if not isinstance(frontmatter, dict):
        raise SkillParseError("YAML frontmatter must be a mapping")

    return frontmatter, body


def parse_skill_md(
    content: str,
    resources: list[dict[str, str]] | None = None,
) -> ParsedSkill:
    """
    Parse and validate a SKILL.md file.

    Args:
        content: Full SKILL.md file content (YAML frontmatter + markdown body).
        resources: Optional list of resource dicts [{"path": "scripts/extract.py", "content": "..."}].

    Returns:
        ParsedSkill with all validated fields.

    Raises:
        SkillParseError: If parsing or validation fails.
    """
    frontmatter, body = _split_frontmatter(content)

    # Required fields
    raw_name = frontmatter.get("name")
    if not raw_name or not isinstance(raw_name, str):
        raise SkillParseError("Frontmatter must include 'name' (string)")

    raw_description = frontmatter.get("description")
    if not raw_description or not isinstance(raw_description, str):
        raise SkillParseError("Frontmatter must include 'description' (string)")

    name = validate_skill_name(raw_name)
    description = _validate_description(raw_description)

    if not body:
        raise SkillParseError("SKILL.md must have instruction content after frontmatter")

    # Optional fields
    license_val = frontmatter.get("license")
    if license_val is not None and not isinstance(license_val, str):
        raise SkillParseError("Frontmatter 'license' must be a string")

    compatibility = frontmatter.get("compatibility")
    if compatibility is not None and not isinstance(compatibility, str):
        raise SkillParseError("Frontmatter 'compatibility' must be a string")

    # Collect any extra frontmatter keys as metadata.
    # `allowed_tools` is intentionally ignored for backward compatibility.
    known_keys = {"name", "description", "license", "compatibility", "allowed_tools"}
    extra_keys = set(frontmatter.keys()) - known_keys
    metadata = {k: str(frontmatter[k]) for k in extra_keys} if extra_keys else None

    return ParsedSkill(
        name=name,
        description=description,
        instructions=body,
        license=str(license_val) if license_val else None,
        compatibility=str(compatibility) if compatibility else None,
        metadata=metadata,
        resources=resources or [],
    )


__all__ = [
    "ParsedSkill",
    "SkillParseError",
    "parse_skill_md",
    "validate_skill_name",
]
