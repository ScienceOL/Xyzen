"""
Skill management tool factory.

Provides:
- create_skill_management_tools(): placeholder tools for registry
- create_skill_management_tools_for_session(): context-bound tools with DB access
"""

from __future__ import annotations

import hashlib
import json
import logging
from io import BytesIO
from typing import TYPE_CHECKING

from langchain_core.tools import BaseTool, StructuredTool

from app.tools.builtin.skill_management.schemas import (
    CreateSkillInput,
    DeleteSkillInput,
    GetSkillDetailInput,
    ListSkillsInput,
    UpdateSkillInput,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

logger = logging.getLogger(__name__)


def create_skill_management_tools() -> dict[str, BaseTool]:
    """Create placeholder tools for registry (non-functional)."""
    from langchain_core.tools import Tool

    return {
        "create_skill": Tool(
            name="create_skill",
            description="Create a new skill with SKILL.md and optional resources",
            func=lambda _: None,
        ),
        "update_skill": Tool(
            name="update_skill",
            description="Update an existing skill's SKILL.md, description, or resources",
            func=lambda _: None,
        ),
        "delete_skill": Tool(
            name="delete_skill",
            description="Delete a user-created skill",
            func=lambda _: None,
        ),
        "list_skills": Tool(
            name="list_skills",
            description="List all skills visible to the user",
            func=lambda _: None,
        ),
        "get_skill_detail": Tool(
            name="get_skill_detail",
            description="Get full details of a skill including SKILL.md and resource paths",
            func=lambda _: None,
        ),
    }


def create_skill_management_tools_for_session(
    user_id: str,
    session_factory: "async_sessionmaker",
) -> list[BaseTool]:
    """Create context-bound skill management tools.

    These tools capture user_id and use a DB session factory to create
    their own sessions at execution time.
    """

    async def create_skill_fn(
        name: str,
        description: str,
        skill_md: str,
        resources: str = "",
    ) -> str:
        """Create a new skill."""
        from app.core.skills.parser import SkillParseError
        from app.core.skills.parser import parse_skill_md as do_parse
        from app.core.skills.storage import (
            build_skill_prefix,
            delete_skill_folder,
            normalize_inline_resources,
            sync_skill_folder,
        )
        from app.core.storage import FileScope, generate_storage_key, get_storage_service
        from app.models.file import FileCreate
        from app.models.skill import SkillCreate, SkillScope, SkillUpdate
        from app.repos.file import FileRepository
        from app.repos.skill import SkillRepository

        # Parse resources JSON
        resource_list: list[dict[str, str]] = []
        if resources.strip():
            try:
                resource_list = json.loads(resources)
                if not isinstance(resource_list, list):
                    return json.dumps({"error": "resources must be a JSON array"})
            except json.JSONDecodeError as e:
                return json.dumps({"error": f"Invalid resources JSON: {e}"})

        # Validate resources
        try:
            normalized_resources = normalize_inline_resources(resource_list)
        except ValueError as e:
            return json.dumps({"error": f"Invalid resources: {e}"})

        resource_payload = [{"path": path, "content": content} for path, content in normalized_resources]

        # Parse and validate SKILL.md
        try:
            parsed = do_parse(skill_md, resources=resource_payload)
        except SkillParseError as e:
            return json.dumps({"error": f"Invalid SKILL.md: {e}"})

        # Validate name/description match frontmatter
        if name != parsed.name:
            return json.dumps({"error": f"name '{name}' must match SKILL.md frontmatter name '{parsed.name}'"})
        if description.strip() != parsed.description:
            return json.dumps({"error": "description must match SKILL.md frontmatter description"})

        prefix: str | None = None

        async with session_factory() as db:
            repo = SkillRepository(db)

            # Check name conflict
            existing = await repo.get_visible_skill_by_name(user_id=user_id, name=parsed.name)
            if existing:
                return json.dumps({"error": f"Skill name '{parsed.name}' is already in use"})

            try:
                skill = await repo.create_skill(
                    SkillCreate(
                        name=parsed.name,
                        description=parsed.description,
                        scope=SkillScope.USER,
                        license=parsed.license,
                        compatibility=parsed.compatibility,
                        metadata_json=parsed.metadata,
                    ),
                    user_id=user_id,
                )

                prefix = build_skill_prefix(user_id=user_id, skill_id=skill.id)
                storage = get_storage_service()
                await sync_skill_folder(
                    prefix=prefix,
                    skill_md=skill_md,
                    resources=resource_payload,
                    storage=storage,
                )

                skill = await repo.update_skill(skill.id, SkillUpdate(resource_prefix=prefix))
                if not skill:
                    return json.dumps({"error": "Failed to persist skill resource prefix"})

                # Create root folder for DB-backed file management
                file_repo = FileRepository(db)
                root = await file_repo.create_file(
                    FileCreate(
                        user_id=user_id,
                        original_filename=parsed.name,
                        is_dir=True,
                        skill_id=skill.id,
                        scope="private",
                        category="others",
                        status="confirmed",
                        file_size=0,
                    )
                )
                skill = await repo.update_skill(skill.id, SkillUpdate(root_folder_id=root.id))
                if not skill:
                    return json.dumps({"error": "Failed to persist skill root folder"})

                # Create SKILL.md File record
                skill_md_bytes = skill_md.encode("utf-8")
                skill_md_key = generate_storage_key(
                    user_id=user_id,
                    filename="SKILL.md",
                    scope=FileScope.PRIVATE,
                )
                await storage.upload_file(
                    file_data=BytesIO(skill_md_bytes),
                    storage_key=skill_md_key,
                    content_type="text/markdown",
                    metadata={"user_id": user_id, "skill_id": str(skill.id)},
                )
                await file_repo.create_file(
                    FileCreate(
                        user_id=user_id,
                        storage_key=skill_md_key,
                        original_filename="SKILL.md",
                        content_type="text/markdown",
                        file_size=len(skill_md_bytes),
                        scope="private",
                        category="others",
                        file_hash=hashlib.sha256(skill_md_bytes).hexdigest(),
                        parent_id=root.id,
                        skill_id=skill.id,
                        status="confirmed",
                    )
                )

                # Create File records for each resource
                for res_path, res_content in normalized_resources:
                    res_bytes = res_content.encode("utf-8")
                    res_key = generate_storage_key(
                        user_id=user_id,
                        filename=res_path.split("/")[-1],
                        scope=FileScope.PRIVATE,
                    )
                    await storage.upload_file(
                        file_data=BytesIO(res_bytes),
                        storage_key=res_key,
                        content_type="text/plain",
                        metadata={"user_id": user_id, "skill_id": str(skill.id)},
                    )

                    # Create intermediate folders for nested resource paths
                    parts = res_path.split("/")
                    current_parent = root.id
                    for dir_name in parts[:-1]:
                        if await file_repo.name_exists_in_parent(
                            user_id,
                            current_parent,
                            dir_name,
                            skill_id=skill.id,
                        ):
                            from sqlmodel import select

                            from app.models.file import File as FileModel

                            stmt = (
                                select(FileModel)
                                .where(FileModel.user_id == user_id)
                                .where(FileModel.parent_id == current_parent)
                                .where(FileModel.original_filename == dir_name)
                                .where(FileModel.is_dir == True)  # noqa: E712
                                .where(FileModel.skill_id == skill.id)
                            )
                            result = await db.exec(stmt)
                            existing_folder = result.first()
                            if existing_folder:
                                current_parent = existing_folder.id
                        else:
                            dir_file = await file_repo.create_file(
                                FileCreate(
                                    user_id=user_id,
                                    original_filename=dir_name,
                                    is_dir=True,
                                    parent_id=current_parent,
                                    skill_id=skill.id,
                                    scope="private",
                                    category="others",
                                    status="confirmed",
                                    file_size=0,
                                )
                            )
                            current_parent = dir_file.id

                    await file_repo.create_file(
                        FileCreate(
                            user_id=user_id,
                            storage_key=res_key,
                            original_filename=parts[-1],
                            content_type="text/plain",
                            file_size=len(res_bytes),
                            scope="private",
                            category="others",
                            file_hash=hashlib.sha256(res_bytes).hexdigest(),
                            parent_id=current_parent,
                            skill_id=skill.id,
                            status="confirmed",
                        )
                    )

                await db.commit()

                return json.dumps(
                    {
                        "success": True,
                        "skill_id": str(skill.id),
                        "name": skill.name,
                        "message": f"Skill '{skill.name}' created successfully.",
                    }
                )
            except Exception:
                await db.rollback()
                if prefix:
                    try:
                        await delete_skill_folder(prefix)
                    except Exception:
                        logger.warning("Failed to cleanup skill folder after create failure", exc_info=True)
                logger.exception("Failed to create skill via tool")
                return json.dumps({"error": "Failed to create skill"})

    async def update_skill_fn(
        skill_name: str,
        skill_md: str = "",
        description: str = "",
        resources: str = "",
    ) -> str:
        """Update an existing skill."""
        from app.core.skills.parser import SkillParseError
        from app.core.skills.parser import parse_skill_md as do_parse
        from app.core.skills.storage import (
            build_skill_prefix,
            load_skill_md,
            normalize_inline_resources,
            sync_skill_folder,
            write_skill_md_only,
        )
        from app.models.skill import SkillScope, SkillUpdate
        from app.repos.skill import SkillRepository

        async with session_factory() as db:
            repo = SkillRepository(db)

            # Find user's skill by name
            user_skills = await repo.get_skills_by_user(user_id)
            skill = None
            for s in user_skills:
                if s.name.lower() == skill_name.strip().lower():
                    skill = s
                    break

            if not skill:
                return json.dumps({"error": f"Skill '{skill_name}' not found among your skills"})

            if skill.scope == SkillScope.BUILTIN:
                return json.dumps({"error": "Cannot modify builtin skills"})

            has_skill_md = bool(skill_md.strip())
            has_description = bool(description.strip())
            has_resources = bool(resources.strip())

            # Parse resources if provided
            resource_list: list[dict[str, str]] = []
            if has_resources:
                try:
                    resource_list = json.loads(resources)
                    if not isinstance(resource_list, list):
                        return json.dumps({"error": "resources must be a JSON array"})
                except json.JSONDecodeError as e:
                    return json.dumps({"error": f"Invalid resources JSON: {e}"})

                try:
                    normalize_inline_resources(resource_list)
                except ValueError as e:
                    return json.dumps({"error": f"Invalid resources: {e}"})

            normalized_resource_payload: list[dict[str, str]] | None = resource_list if has_resources else None

            # Validate SKILL.md if provided
            if has_skill_md:
                try:
                    parsed = do_parse(skill_md, resources=normalized_resource_payload)
                except SkillParseError as e:
                    return json.dumps({"error": f"Invalid SKILL.md: {e}"})

                if parsed.name != skill.name:
                    return json.dumps(
                        {
                            "error": f"SKILL.md frontmatter name '{parsed.name}' must match current skill name '{skill.name}'"
                        }
                    )

            # Build update payload
            update_payload: dict[str, str | None] = {}
            if has_description:
                update_payload["description"] = description.strip()

            prefix = skill.resource_prefix
            if not prefix and (has_skill_md or has_resources):
                prefix = build_skill_prefix(user_id=skill.user_id, skill_id=skill.id)
                update_payload["resource_prefix"] = prefix

            try:
                if has_resources and prefix:
                    # Need SKILL.md for sync_skill_folder
                    effective_skill_md = skill_md if has_skill_md else await load_skill_md(prefix, skill=skill, db=db)
                    if not effective_skill_md:
                        return json.dumps({"error": "Cannot determine current SKILL.md; provide skill_md to repair"})
                    await sync_skill_folder(
                        prefix=prefix,
                        skill_md=effective_skill_md,
                        resources=normalized_resource_payload,
                    )
                elif has_skill_md and prefix:
                    await write_skill_md_only(prefix=prefix, skill_md=skill_md)

                if update_payload:
                    update_data = SkillUpdate(
                        description=update_payload.get("description"),
                        resource_prefix=update_payload.get("resource_prefix"),
                    )
                    updated = await repo.update_skill(skill.id, update_data)
                    if not updated:
                        return json.dumps({"error": "Failed to update skill"})

                await db.commit()

                return json.dumps(
                    {
                        "success": True,
                        "name": skill.name,
                        "message": f"Skill '{skill.name}' updated successfully.",
                    }
                )
            except Exception:
                await db.rollback()
                logger.exception("Failed to update skill '%s' via tool", skill_name)
                return json.dumps({"error": "Failed to update skill"})

    async def delete_skill_fn(skill_name: str) -> str:
        """Delete a user-created skill."""
        from app.core.skills.storage import delete_skill_folder
        from app.core.storage import get_storage_service
        from app.models.skill import SkillScope
        from app.repos.file import FileRepository
        from app.repos.skill import SkillRepository

        async with session_factory() as db:
            repo = SkillRepository(db)

            # Find user's skill by name
            user_skills = await repo.get_skills_by_user(user_id)
            skill = None
            for s in user_skills:
                if s.name.lower() == skill_name.strip().lower():
                    skill = s
                    break

            if not skill:
                return json.dumps({"error": f"Skill '{skill_name}' not found among your skills"})

            if skill.scope == SkillScope.BUILTIN:
                return json.dumps({"error": "Cannot delete builtin skills"})

            resource_prefix = skill.resource_prefix

            # Cascade-delete all DB-backed skill files
            file_repo = FileRepository(db)
            db_storage_keys = await file_repo.hard_delete_by_skill(skill.id)

            await repo.delete_skill(skill.id)
            await db.commit()

            # Clean up OSS objects after commit
            storage = get_storage_service()
            if resource_prefix:
                try:
                    await delete_skill_folder(resource_prefix, storage=storage)
                except Exception:
                    logger.warning(
                        "Failed to cleanup skill folder for deleted skill '%s'",
                        skill_name,
                        exc_info=True,
                    )

            if db_storage_keys:
                try:
                    await storage.delete_files(db_storage_keys)
                except Exception:
                    logger.warning(
                        "Failed to cleanup DB-backed files for deleted skill '%s'",
                        skill_name,
                        exc_info=True,
                    )

            return json.dumps(
                {
                    "success": True,
                    "message": f"Skill '{skill_name}' deleted successfully.",
                }
            )

    async def list_skills_fn() -> str:
        """List all skills visible to the user."""
        from app.repos.skill import SkillRepository

        async with session_factory() as db:
            repo = SkillRepository(db)
            skills = await repo.get_user_and_builtin_skills(user_id)

        if not skills:
            return json.dumps({"skills": [], "message": "No skills found."})

        skill_list = []
        for s in skills:
            skill_list.append(
                {
                    "name": s.name,
                    "description": s.description,
                    "scope": s.scope,
                    "created_at": s.created_at.isoformat(),
                }
            )

        return json.dumps({"skills": skill_list, "count": len(skill_list)})

    async def get_skill_detail_fn(skill_name: str) -> str:
        """Get full details of a skill."""
        from app.core.skills.storage import list_skill_resource_paths, load_skill_md
        from app.repos.skill import SkillRepository

        async with session_factory() as db:
            repo = SkillRepository(db)

            # Find skill by name (user's own + builtin)
            skill = await repo.get_visible_skill_by_name(user_id=user_id, name=skill_name.strip())
            if not skill:
                return json.dumps({"error": f"Skill '{skill_name}' not found"})

            skill_md_content = await load_skill_md(skill.resource_prefix, skill=skill, db=db)
            resource_paths = await list_skill_resource_paths(skill.resource_prefix)

        return json.dumps(
            {
                "name": skill.name,
                "description": skill.description,
                "scope": skill.scope,
                "skill_md": skill_md_content or "",
                "resource_paths": resource_paths,
                "created_at": skill.created_at.isoformat(),
            }
        )

    tools: list[BaseTool] = [
        StructuredTool(
            name="create_skill",
            description=(
                "Create a new skill with a SKILL.md file and optional resource files. "
                "The SKILL.md must have YAML frontmatter with name and description fields."
            ),
            args_schema=CreateSkillInput,
            coroutine=create_skill_fn,
        ),
        StructuredTool(
            name="update_skill",
            description=(
                "Update an existing skill's SKILL.md content, description, or resource files. "
                "Only user-created skills can be modified. Use empty strings to keep fields unchanged."
            ),
            args_schema=UpdateSkillInput,
            coroutine=update_skill_fn,
        ),
        StructuredTool(
            name="delete_skill",
            description="Delete a user-created skill by name. Builtin skills cannot be deleted.",
            args_schema=DeleteSkillInput,
            coroutine=delete_skill_fn,
        ),
        StructuredTool(
            name="list_skills",
            description="List all skills visible to the current user (their own + builtin).",
            args_schema=ListSkillsInput,
            coroutine=list_skills_fn,
        ),
        StructuredTool(
            name="get_skill_detail",
            description=("Get full details of a skill including its SKILL.md content and resource file paths."),
            args_schema=GetSkillDetailInput,
            coroutine=get_skill_detail_fn,
        ),
    ]

    return tools
