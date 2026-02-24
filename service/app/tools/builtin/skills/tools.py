"""
Skill tool factory functions.

Creates LangChain tools for skill activation and resource management.
Follows the dual factory pattern:
- create_skill_tools() -> placeholders for registry
- create_skill_tools_for_session() -> session-bound working tools
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

from .schemas import ActivateSkillInput, ListSkillResourcesInput

logger = logging.getLogger(__name__)


# In-memory type for passing skill data to the tools
class SkillInfo:
    """Lightweight skill metadata for tool closures."""

    __slots__ = ("id", "name", "description", "resource_prefix", "root_folder_id")

    def __init__(
        self,
        name: str,
        description: str,
        resource_prefix: str | None = None,
        id: str | None = None,
        root_folder_id: str | None = None,
    ):
        self.id = id
        self.name = name
        self.description = description
        self.resource_prefix = resource_prefix
        self.root_folder_id = root_folder_id


def create_skill_tools() -> dict[str, BaseTool]:
    """
    Create skill tools with placeholder implementations.

    These are template tools for the registry — actual execution
    requires session binding via create_skill_tools_for_session().

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    tools: dict[str, BaseTool] = {}

    _placeholder_error: dict[str, Any] = {
        "error": "Skill tools require session context binding",
        "success": False,
    }

    async def activate_placeholder(skill_name: str) -> dict[str, Any]:
        return _placeholder_error

    tools["activate_skill"] = StructuredTool(
        name="activate_skill",
        description=(
            "Activate an agent skill to get detailed instructions and deploy "
            "its resources to the sandbox. Call this when a user's request "
            "matches an available skill. Returns the full instructions "
            "for performing the task."
        ),
        args_schema=ActivateSkillInput,
        coroutine=activate_placeholder,
    )

    async def list_resources_placeholder(skill_name: str) -> dict[str, Any]:
        return _placeholder_error

    tools["list_skill_resources"] = StructuredTool(
        name="list_skill_resources",
        description=(
            "List the resource files (scripts, references, assets) available for an activated skill in the sandbox."
        ),
        args_schema=ListSkillResourcesInput,
        coroutine=list_resources_placeholder,
    )

    return tools


def create_skill_tools_for_session(
    skills: list[SkillInfo],
    session_id: str,
    user_id: str | None = None,
) -> list[BaseTool]:
    """
    Create skill tools bound to a specific session.

    The activate_skill tool returns full SKILL.md instructions and
    lazily deploys resources to the sandbox on first activation.

    Args:
        skills: List of SkillInfo objects for the agent's attached skills.
        session_id: Session UUID string for sandbox access.

    Returns:
        List of BaseTool instances with session context bound.
    """
    from app.core.skills.sandbox_deployer import SKILLS_BASE_PATH

    # Build lookup by name
    skill_map: dict[str, SkillInfo] = {s.name: s for s in skills}
    activated: set[str] = set()  # Track which skills have been deployed

    # --- activate_skill ---
    async def activate_skill_bound(skill_name: str) -> dict[str, Any]:
        skill = skill_map.get(skill_name)
        if not skill:
            available = ", ".join(sorted(skill_map.keys()))
            return {
                "success": False,
                "error": f"Skill '{skill_name}' not found. Available skills: {available}",
            }

        # Deploy to sandbox on first activation (lazy)
        deployed_path = None
        instructions: str | None = None

        if skill.resource_prefix or skill.root_folder_id:
            try:
                from app.core.skills import load_skill_md

                if skill.root_folder_id:
                    from app.infra.database import get_task_db_session

                    async with get_task_db_session() as db:
                        instructions = await load_skill_md(
                            skill.resource_prefix,
                            skill=skill,
                            db=db,
                        )
                else:
                    instructions = await load_skill_md(skill.resource_prefix)
            except Exception:
                logger.exception("Failed to load SKILL.md for skill '%s'", skill_name)

        if not instructions:
            return {
                "success": False,
                "error": f"Skill '{skill_name}' is missing SKILL.md in storage",
            }

        if skill_name not in activated and (skill.resource_prefix or skill.root_folder_id):
            try:
                from app.core.skills import load_skill_resource_files
                from app.core.skills.sandbox_deployer import deploy_skill_to_sandbox
                from app.infra.sandbox import get_sandbox_manager

                if skill.root_folder_id:
                    from app.infra.database import get_task_db_session

                    async with get_task_db_session() as db:
                        resource_files = await load_skill_resource_files(
                            skill.resource_prefix,
                            skill=skill,
                            db=db,
                        )
                else:
                    resource_files = await load_skill_resource_files(skill.resource_prefix)
                manager = get_sandbox_manager(session_id, user_id=user_id)
                deployed_path = await deploy_skill_to_sandbox(
                    manager=manager,
                    skill_name=skill.name,
                    skill_md=instructions,
                    resources=resource_files,
                )
                activated.add(skill_name)
            except Exception:
                logger.exception(f"Failed to deploy skill '{skill_name}' to sandbox")
                # Non-fatal: instructions are still useful without resources

        result: dict[str, Any] = {
            "success": True,
            "skill_name": skill.name,
            "instructions": instructions,
        }

        if skill.resource_prefix or skill.root_folder_id:
            from app.core.skills import list_skill_resource_paths

            resource_paths = await list_skill_resource_paths(skill.resource_prefix)
            result["resource_paths"] = resource_paths
            result["resources_base"] = deployed_path or f"{SKILLS_BASE_PATH}/{skill.name}"

        return result

    tools: list[BaseTool] = []

    tools.append(
        StructuredTool(
            name="activate_skill",
            description=(
                "Activate an agent skill to get detailed instructions and deploy "
                "its resources to the sandbox. Call this when a user's request "
                "matches an available skill. Returns the full instructions "
                "for performing the task."
            ),
            args_schema=ActivateSkillInput,
            coroutine=activate_skill_bound,
        )
    )

    # --- list_skill_resources ---
    async def list_skill_resources_bound(skill_name: str) -> dict[str, Any]:
        skill = skill_map.get(skill_name)
        if not skill:
            available = ", ".join(sorted(skill_map.keys()))
            return {
                "success": False,
                "error": f"Skill '{skill_name}' not found. Available skills: {available}",
            }

        if not skill.resource_prefix:
            return {
                "success": True,
                "skill_name": skill.name,
                "resources": [],
                "message": "This skill has no resource files.",
            }

        from app.core.skills import list_skill_resource_paths

        paths = await list_skill_resource_paths(skill.resource_prefix)
        resource_list = []
        base = f"{SKILLS_BASE_PATH}/{skill.name}"
        for path in paths:
            resource_list.append(f"{base}/{path}")

        return {
            "success": True,
            "skill_name": skill.name,
            "resources_base": base,
            "resources": resource_list,
        }

    tools.append(
        StructuredTool(
            name="list_skill_resources",
            description=(
                "List the resource files (scripts, references, assets) available for an activated skill in the sandbox."
            ),
            args_schema=ListSkillResourcesInput,
            coroutine=list_skill_resources_bound,
        )
    )

    return tools


__all__ = [
    "SkillInfo",
    "create_skill_tools",
    "create_skill_tools_for_session",
]
