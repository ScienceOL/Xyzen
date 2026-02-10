"""
Skills API Handlers.

Endpoints for skill CRUD and agent-skill attachment:
- POST   /v1/skills              — Create skill
- GET    /v1/skills              — List user's skills + builtin skills
- GET    /v1/skills/{id}         — Get skill details
- GET    /v1/skills/{id}/resources — List skill resource file paths
- PATCH  /v1/skills/{id}         — Update skill
- DELETE /v1/skills/{id}         — Delete skill
- POST   /v1/skills/parse        — Validate a SKILL.md (preview, no persist)
- POST   /v1/agents/{id}/skills          — Attach skill to agent
- DELETE /v1/agents/{id}/skills/{sid}     — Detach skill from agent
- GET    /v1/agents/{id}/skills          — List attached skills
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import StorageServiceProto, get_storage_service
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.skill import SkillCreate, SkillRead, SkillScope, SkillUpdate
from app.repos.skill import SkillRepository

router = APIRouter(tags=["skills"])
logger = logging.getLogger(__name__)

# Separate router for agent-scoped skill endpoints (mounted under /agents)
agent_skills_router = APIRouter(tags=["agents"])


# --- Skill CRUD ---


class SkillResourceInput(BaseModel):
    """Inline resource file payload."""

    path: str
    content: str


class SkillParseRequest(BaseModel):
    """Request body for SKILL.md parse/validation."""

    skill_md: str
    resources: list[SkillResourceInput] | None = None


class SkillCreateRequest(BaseModel):
    """Request payload for creating a skill."""

    name: str
    description: str
    skill_md: str
    license: str | None = None
    compatibility: str | None = None
    metadata_json: dict[str, Any] | None = None
    resources: list[SkillResourceInput] | None = None


class SkillUpdateRequest(BaseModel):
    """Request payload for updating a skill."""

    name: str | None = None
    description: str | None = None
    skill_md: str | None = None
    license: str | None = None
    compatibility: str | None = None
    metadata_json: dict[str, Any] | None = None
    resources: list[SkillResourceInput] | None = None


class SkillParseResponse(BaseModel):
    """Response from SKILL.md parse/validation."""

    valid: bool
    name: str | None = None
    description: str | None = None
    error: str | None = None


@router.post("/parse", response_model=SkillParseResponse)
async def parse_skill_md(
    body: SkillParseRequest,
    user_id: str = Depends(get_current_user),
) -> SkillParseResponse:
    """
    Validate a SKILL.md without persisting. Returns parsed metadata or error.
    """
    from app.core.skills.parser import SkillParseError
    from app.core.skills.parser import parse_skill_md as do_parse
    from app.core.skills.storage import normalize_inline_resources

    _ = user_id  # auth gate
    raw_resource_payload = [r.model_dump() for r in (body.resources or [])]

    try:
        normalized_resources = normalize_inline_resources(raw_resource_payload)
    except ValueError as e:
        return SkillParseResponse(valid=False, error=f"Invalid resources: {e}")

    resource_payload = [{"path": path, "content": content} for path, content in normalized_resources]

    try:
        parsed = do_parse(body.skill_md, resources=resource_payload)
        return SkillParseResponse(valid=True, name=parsed.name, description=parsed.description)
    except SkillParseError as e:
        return SkillParseResponse(valid=False, error=str(e))


@router.post("/", response_model=SkillRead)
async def create_skill(
    body: SkillCreateRequest,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> SkillRead:
    """
    Create a new skill for the current user.

    The skill_md field must be a valid SKILL.md with YAML frontmatter.
    """
    from app.core.skills.parser import SkillParseError
    from app.core.skills.parser import parse_skill_md as do_parse
    from app.core.skills.storage import (
        build_skill_prefix,
        delete_skill_folder,
        normalize_inline_resources,
        sync_skill_folder,
    )

    raw_resource_payload = [r.model_dump() for r in (body.resources or [])]
    try:
        normalized_resources = normalize_inline_resources(raw_resource_payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid resources: {e}")
    resource_payload = [{"path": path, "content": content} for path, content in normalized_resources]

    try:
        parsed = do_parse(body.skill_md, resources=resource_payload)
    except SkillParseError as e:
        raise HTTPException(status_code=422, detail=f"Invalid SKILL.md: {e}")

    repo = SkillRepository(db)
    if body.name != parsed.name:
        raise HTTPException(status_code=422, detail="name must match SKILL.md frontmatter name")
    if body.description.strip() != parsed.description:
        raise HTTPException(status_code=422, detail="description must match SKILL.md frontmatter description")

    existing_name = await repo.get_visible_skill_by_name(user_id=user_id, name=parsed.name)
    if existing_name:
        raise HTTPException(status_code=409, detail=f"Skill name '{parsed.name}' is already in use")

    prefix: str | None = None

    try:
        skill = await repo.create_skill(
            SkillCreate(
                name=parsed.name,
                description=parsed.description,
                scope=SkillScope.USER,
                license=body.license,
                compatibility=body.compatibility,
                metadata_json=body.metadata_json,
            ),
            user_id=user_id,
        )

        prefix = build_skill_prefix(user_id=user_id, skill_id=skill.id)
        await sync_skill_folder(
            prefix=prefix,
            skill_md=body.skill_md,
            resources=resource_payload,
            storage=storage,
        )

        skill = await repo.update_skill(skill.id, SkillUpdate(resource_prefix=prefix))
        if not skill:
            raise HTTPException(status_code=500, detail="Failed to persist skill resource prefix")

        await db.commit()
        return SkillRead.model_validate(skill)
    except HTTPException:
        await db.rollback()
        if prefix:
            try:
                await delete_skill_folder(prefix, storage=storage)
            except Exception:
                logger.warning("Failed to cleanup skill folder after create rollback", exc_info=True)
        raise
    except ValueError as e:
        await db.rollback()
        if prefix:
            try:
                await delete_skill_folder(prefix, storage=storage)
            except Exception:
                logger.warning("Failed to cleanup skill folder after validation failure", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Invalid resources: {e}")
    except Exception:
        await db.rollback()
        if prefix:
            try:
                await delete_skill_folder(prefix, storage=storage)
            except Exception:
                logger.warning("Failed to cleanup skill folder after unexpected error", exc_info=True)
        logger.exception("Failed to create skill")
        raise HTTPException(status_code=500, detail="Failed to create skill")


@router.get("/", response_model=list[SkillRead])
async def list_skills(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillRead]:
    """List all skills visible to the current user (own + builtin)."""
    repo = SkillRepository(db)
    skills = await repo.get_user_and_builtin_skills(user_id)
    return [SkillRead.model_validate(s) for s in skills]


@router.get("/{skill_id}", response_model=SkillRead)
async def get_skill(
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillRead:
    """Get a specific skill by ID."""
    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.scope != SkillScope.BUILTIN and skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return SkillRead.model_validate(skill)


@router.get("/{skill_id}/resources", response_model=list[str])
async def list_skill_resources(
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> list[str]:
    """List all resource file paths for a skill (excluding SKILL.md)."""
    from app.core.skills import list_skill_resource_paths

    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.scope != SkillScope.BUILTIN and skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return await list_skill_resource_paths(skill.resource_prefix, storage=storage)


@router.patch("/{skill_id}", response_model=SkillRead)
async def update_skill(
    skill_id: UUID,
    body: SkillUpdateRequest,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> SkillRead:
    """Update a skill owned by the current user."""
    from app.core.skills.parser import SkillParseError, validate_skill_name
    from app.core.skills.parser import parse_skill_md as do_parse
    from app.core.skills.storage import (
        build_skill_prefix,
        load_skill_md,
        normalize_inline_resources,
        sync_skill_folder,
        write_skill_md_only,
    )

    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Can only update your own skills")

    fields_set = body.model_fields_set
    has_name_update = "name" in fields_set
    has_description_update = "description" in fields_set
    has_resource_update = "resources" in fields_set
    has_skill_md_update = "skill_md" in fields_set

    if has_name_update and body.name is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if has_description_update and body.description is None:
        raise HTTPException(status_code=422, detail="description cannot be null")
    if has_skill_md_update and body.skill_md is None:
        raise HTTPException(status_code=422, detail="skill_md cannot be null")
    if has_resource_update and body.resources is None:
        raise HTTPException(status_code=422, detail="resources cannot be null")

    raw_resource_payload = [r.model_dump() for r in (body.resources or [])]
    normalized_resource_payload: list[dict[str, str]] | None = None
    if has_resource_update:
        try:
            normalized_resources = normalize_inline_resources(raw_resource_payload)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Invalid resources: {e}")
        normalized_resource_payload = [{"path": path, "content": content} for path, content in normalized_resources]
    effective_name = skill.name
    if has_name_update and body.name is not None:
        try:
            effective_name = validate_skill_name(body.name)
        except SkillParseError as e:
            raise HTTPException(status_code=422, detail=f"Invalid skill name: {e}")

    existing_name = await repo.get_visible_skill_by_name(
        user_id=user_id,
        name=effective_name,
        exclude_skill_id=skill.id,
    )
    if existing_name:
        raise HTTPException(status_code=409, detail=f"Skill name '{effective_name}' is already in use")

    update_payload: dict[str, Any] = {}
    if has_name_update:
        update_payload["name"] = effective_name
    if has_description_update:
        update_payload["description"] = body.description
    if "license" in fields_set:
        update_payload["license"] = body.license
    if "compatibility" in fields_set:
        update_payload["compatibility"] = body.compatibility
    if "metadata_json" in fields_set:
        update_payload["metadata_json"] = body.metadata_json

    prefix = skill.resource_prefix
    if not prefix and (has_skill_md_update or has_resource_update):
        prefix = build_skill_prefix(user_id=skill.user_id, skill_id=skill.id)
        update_payload["resource_prefix"] = prefix

    update_data = SkillUpdate(**update_payload)

    try:
        effective_skill_md: str | None = body.skill_md
        if effective_skill_md is None and (has_skill_md_update or has_resource_update):
            effective_skill_md = await load_skill_md(prefix, storage=storage)
            if not effective_skill_md:
                raise HTTPException(
                    status_code=422,
                    detail="Missing SKILL.md in OSS; provide skill_md to repair this skill",
                )

        if has_skill_md_update or has_resource_update:
            if effective_skill_md is None:
                raise HTTPException(
                    status_code=422,
                    detail="skill_md is required when updating SKILL.md or resources",
                )
            try:
                parsed = do_parse(
                    effective_skill_md,
                    resources=normalized_resource_payload if has_resource_update else None,
                )
                if parsed.name != effective_name:
                    raise HTTPException(
                        status_code=422,
                        detail="name must match SKILL.md frontmatter name",
                    )
            except SkillParseError as e:
                raise HTTPException(status_code=422, detail=f"Invalid SKILL.md: {e}")

        if has_resource_update and prefix:
            if effective_skill_md is None:
                raise HTTPException(status_code=422, detail="skill_md is required for resource updates")
            await sync_skill_folder(
                prefix=prefix,
                skill_md=effective_skill_md,
                resources=normalized_resource_payload,
                storage=storage,
            )
        elif has_skill_md_update and prefix:
            if effective_skill_md is None:
                raise HTTPException(status_code=422, detail="skill_md is required for SKILL.md updates")
            await write_skill_md_only(prefix=prefix, skill_md=effective_skill_md, storage=storage)

        updated = await repo.update_skill(skill_id, update_data)
        if not updated:
            raise HTTPException(status_code=404, detail="Skill not found")

        await db.commit()
        return SkillRead.model_validate(updated)
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=422, detail=f"Invalid resources: {e}")
    except Exception:
        await db.rollback()
        logger.exception("Failed to update skill %s", skill_id)
        raise HTTPException(status_code=500, detail="Failed to update skill")


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Delete a skill owned by the current user."""
    from app.core.skills.storage import delete_skill_folder

    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Can only delete your own skills")

    resource_prefix = skill.resource_prefix
    await repo.delete_skill(skill_id)
    await db.commit()

    if resource_prefix:
        try:
            await delete_skill_folder(resource_prefix, storage=storage)
        except Exception:
            logger.warning("Failed to cleanup skill folder for deleted skill %s", skill_id, exc_info=True)


# --- Agent-Skill attachment (mounted under /agents/{agent_id}/skills) ---


class AttachSkillRequest(BaseModel):
    """Request body for attaching a skill to an agent."""

    skill_id: UUID


@agent_skills_router.post("/{agent_id}/skills", status_code=201)
async def attach_skill_to_agent(
    agent_id: UUID,
    body: AttachSkillRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Attach a skill to an agent."""
    from app.repos import AgentRepository

    agent_repo = AgentRepository(db)
    agent = await agent_repo.get_agent_by_id_raw(agent_id)
    if not agent or agent.user_id != user_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    skill_repo = SkillRepository(db)
    skill = await skill_repo.get_skill_by_id(body.skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.scope != SkillScope.BUILTIN and skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Skill access denied")

    attached_skills = await skill_repo.get_skills_for_agent(agent_id)
    for attached in attached_skills:
        if attached.id == skill.id:
            raise HTTPException(status_code=409, detail="Skill already attached")
        if attached.name.lower() == skill.name.lower():
            raise HTTPException(
                status_code=409,
                detail=f"Agent already has a skill named '{skill.name}'",
            )

    created = await skill_repo.attach_skill_to_agent(agent_id, body.skill_id)
    if not created:
        raise HTTPException(status_code=409, detail="Skill already attached")

    await db.commit()
    return {"status": "attached"}


@agent_skills_router.delete("/{agent_id}/skills/{skill_id}", status_code=204)
async def detach_skill_from_agent(
    agent_id: UUID,
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Detach a skill from an agent."""
    from app.repos import AgentRepository

    agent_repo = AgentRepository(db)
    agent = await agent_repo.get_agent_by_id_raw(agent_id)
    if not agent or agent.user_id != user_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    skill_repo = SkillRepository(db)
    removed = await skill_repo.detach_skill_from_agent(agent_id, skill_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Skill not attached to agent")

    await db.commit()


@agent_skills_router.get("/{agent_id}/skills", response_model=list[SkillRead])
async def list_agent_skills(
    agent_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillRead]:
    """List all skills attached to an agent."""
    from app.repos import AgentRepository

    agent_repo = AgentRepository(db)
    agent = await agent_repo.get_agent_by_id_raw(agent_id)
    if not agent or agent.user_id != user_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    skill_repo = SkillRepository(db)
    skills = await skill_repo.get_skills_for_agent(agent_id)
    return [SkillRead.model_validate(s) for s in skills]
