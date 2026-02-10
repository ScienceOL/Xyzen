"""
Sandbox deployer for agent skills.

Deploys SKILL.md and resource files to the sandbox at
/workspace/.skills/<skill_name>/ on first activation.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.infra.sandbox.manager import SandboxManager

logger = logging.getLogger(__name__)

SKILLS_BASE_PATH = "/workspace/.skills"


async def deploy_skill_to_sandbox(
    manager: "SandboxManager",
    skill_name: str,
    skill_md: str,
    resources: list[dict[str, Any]] | None = None,
) -> str:
    """
    Deploy a skill's files to the sandbox.

    Creates /workspace/.skills/<skill_name>/ with:
    - SKILL.md (the full instructions)
    - Any resource files (scripts/, references/, assets/)

    Args:
        manager: SandboxManager instance (lazy — provisions on first call).
        skill_name: Validated skill name.
        skill_md: Full SKILL.md content.
        resources: Optional list of [{"path": "scripts/foo.py", "content": "..."}].

    Returns:
        Base path of the deployed skill in the sandbox.
    """
    from app.core.skills.parser import validate_skill_name

    validated_skill_name = validate_skill_name(skill_name)
    base_path = f"{SKILLS_BASE_PATH}/{validated_skill_name}"

    # Write SKILL.md
    await manager.write_file(f"{base_path}/SKILL.md", skill_md)
    logger.debug(f"Deployed SKILL.md to {base_path}/SKILL.md")

    # Write resource files
    if resources:
        for resource in resources:
            rel_path = resource.get("path", "")
            content = resource.get("content", "")
            if rel_path and content:
                full_path = f"{base_path}/{rel_path}"
                await manager.write_file(full_path, content)
                logger.debug(f"Deployed resource: {full_path}")

        # Make scripts executable
        script_resources = [r for r in resources if r.get("path", "").startswith("scripts/")]
        if script_resources:
            await manager.exec(f"chmod -R +x {base_path}/scripts/ 2>/dev/null || true")

    logger.info(f"Skill '{skill_name}' deployed to sandbox at {base_path}")
    return base_path
