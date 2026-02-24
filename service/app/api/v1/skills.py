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
- GET    /v1/skills/{id}/files/tree     — Flat file tree for skill resources
- POST   /v1/skills/{id}/files/upload   — Upload file to skill
- GET    /v1/skills/{id}/files/stats    — Skill storage stats
- PATCH  /v1/skills/{id}/files/{fid}    — Rename/move skill file
- DELETE /v1/skills/{id}/files/{fid}    — Delete skill file
- GET    /v1/skills/{id}/files/{fid}/download — Download skill file
- POST   /v1/skills/{id}/folders        — Create folder in skill
- PATCH  /v1/skills/{id}/folders/{fid}  — Rename/move skill folder
- DELETE /v1/skills/{id}/folders/{fid}  — Delete skill folder (recursive)
- GET    /v1/skills/{id}/folders/{fid}/path — Breadcrumb path
- POST   /v1/agents/{id}/skills          — Attach skill to agent
- DELETE /v1/agents/{id}/skills/{sid}     — Detach skill from agent
- GET    /v1/agents/{id}/skills          — List attached skills
"""

import hashlib
import logging
import mimetypes
from io import BytesIO
from typing import Any
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import (
    FileCategory,
    FileScope,
    StorageServiceProto,
    detect_file_category,
    generate_storage_key,
    get_storage_service,
)
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.file import FileCreate, FileUpdate
from app.models.skill import SkillCreate, SkillRead, SkillScope, SkillUpdate
from app.repos.file import FileRepository
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
            raise HTTPException(status_code=500, detail="Failed to persist skill root folder")

        # Create File records for inline resources (SKILL.md + resources)
        # Upload SKILL.md as a File record
        skill_md_bytes = body.skill_md.encode("utf-8")
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

            # Create intermediate folders if the resource path has directories
            parts = res_path.split("/")
            current_parent = root.id
            for dir_name in parts[:-1]:
                # Check if folder already exists
                existing = await file_repo.name_exists_in_parent(
                    user_id,
                    current_parent,
                    dir_name,
                    skill_id=skill.id,
                )
                if existing:
                    # Find the existing folder
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
    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Can only delete your own skills")

    resource_prefix = skill.resource_prefix

    # Cascade-delete all DB-backed skill files
    file_repo = FileRepository(db)
    db_storage_keys = await file_repo.hard_delete_by_skill(skill_id)

    await repo.delete_skill(skill_id)
    await db.commit()

    # Clean up OSS objects
    all_oss_keys = list(db_storage_keys)
    if resource_prefix:
        try:
            from app.core.skills.storage import delete_skill_folder as _delete_oss_folder

            await _delete_oss_folder(resource_prefix, storage=storage)
        except Exception:
            logger.warning("Failed to cleanup skill folder for deleted skill %s", skill_id, exc_info=True)

    if all_oss_keys:
        try:
            await storage.delete_files(all_oss_keys)
        except Exception:
            logger.warning("Failed to cleanup DB-backed files for deleted skill %s", skill_id, exc_info=True)


# --- Skill Resource File/Folder CRUD ---

# Limits for skill resources
_MAX_SKILL_FILES = 200
_MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024  # 2 MiB per file
_MAX_SKILL_TOTAL_BYTES = 25 * 1024 * 1024  # 25 MiB total


class SkillFileTreeItem(SQLModel):
    """A single item in the skill resource tree."""

    id: UUID
    parent_id: UUID | None = None
    name: str
    is_dir: bool = False
    file_size: int = 0
    content_type: str | None = None
    is_deleted: bool = False
    deleted_at: str | None = None
    created_at: str
    updated_at: str


class SkillFolderResponse(SQLModel):
    id: UUID
    user_id: str
    parent_id: UUID | None = None
    name: str
    is_deleted: bool = False
    created_at: str
    updated_at: str


class SkillFolderCreateRequest(SQLModel):
    name: str
    parent_id: UUID | None = None


class SkillFolderUpdateRequest(SQLModel):
    name: str | None = None
    parent_id: UUID | None = None


class SkillFileUpdateRequest(SQLModel):
    original_filename: str | None = None
    parent_id: UUID | None = None


class SkillStorageStats(SQLModel):
    file_count: int
    total_size: int
    max_files: int = _MAX_SKILL_FILES
    max_file_size: int = _MAX_SKILL_FILE_BYTES
    max_total_size: int = _MAX_SKILL_TOTAL_BYTES


async def _get_skill_for_resources(
    skill_id: UUID,
    user_id: str,
    db: AsyncSession,
    *,
    require_writable: bool = False,
):
    """Shared helper: fetch skill, verify access, optionally require writable."""
    repo = SkillRepository(db)
    skill = await repo.get_skill_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.scope != SkillScope.BUILTIN and skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if require_writable and skill.scope == SkillScope.BUILTIN:
        raise HTTPException(status_code=403, detail="Cannot modify builtin skill resources")
    if require_writable and skill.user_id != user_id:
        raise HTTPException(status_code=403, detail="Can only modify your own skills")
    return skill


async def _ensure_root_folder(
    skill,
    user_id: str,
    db: AsyncSession,
) -> UUID:
    """Ensure the skill has a root folder; create one lazily if needed."""
    if skill.root_folder_id:
        return skill.root_folder_id

    file_repo = FileRepository(db)
    root = await file_repo.create_file(
        FileCreate(
            user_id=user_id,
            original_filename=skill.name,
            is_dir=True,
            skill_id=skill.id,
            scope="private",
            category="others",
            status="confirmed",
            file_size=0,
        )
    )

    skill_repo = SkillRepository(db)
    await skill_repo.update_skill(skill.id, SkillUpdate(root_folder_id=root.id))
    await db.commit()
    await db.refresh(skill)
    return root.id


@router.get("/{skill_id}/files/tree", response_model=list[SkillFileTreeItem])
async def get_skill_file_tree(
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillFileTreeItem]:
    """Return a flat file tree of all resources in a skill."""
    skill = await _get_skill_for_resources(skill_id, user_id, db)

    if not skill.root_folder_id:
        return []

    file_repo = FileRepository(db)
    items = await file_repo.get_all_items(
        user_id=skill.user_id or user_id,
        include_deleted=False,
        skill_id=skill.id,
    )

    # Exclude the root folder itself from the tree
    return [
        SkillFileTreeItem(
            id=f.id,
            parent_id=f.parent_id if f.parent_id != skill.root_folder_id else None,
            name=f.original_filename,
            is_dir=f.is_dir,
            file_size=f.file_size,
            content_type=f.content_type,
            is_deleted=f.is_deleted,
            deleted_at=f.deleted_at.isoformat() if f.deleted_at else None,
            created_at=f.created_at.isoformat(),
            updated_at=f.updated_at.isoformat(),
        )
        for f in items
        if f.id != skill.root_folder_id
    ]


@router.get("/{skill_id}/files/stats", response_model=SkillStorageStats)
async def get_skill_storage_stats(
    skill_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillStorageStats:
    """Get storage statistics for a skill's resources."""
    skill = await _get_skill_for_resources(skill_id, user_id, db)

    if not skill.root_folder_id:
        return SkillStorageStats(file_count=0, total_size=0)

    file_repo = FileRepository(db)
    file_count = await file_repo.get_skill_file_count(skill.id)
    total_size = await file_repo.get_skill_total_size(skill.id)

    return SkillStorageStats(file_count=file_count, total_size=total_size)


@router.post("/{skill_id}/files/upload", status_code=status.HTTP_201_CREATED)
async def upload_skill_file(
    skill_id: UUID,
    file: UploadFile = File(...),
    parent_id: UUID | None = Form(None),
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload a resource file to a skill."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)
    root_folder_id = await _ensure_root_folder(skill, user_id, db)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    file_data = await file.read()
    if not file_data:
        raise HTTPException(status_code=400, detail="File is empty")

    file_size = len(file_data)

    # Check per-file size limit
    if file_size > _MAX_SKILL_FILE_BYTES:
        max_mb = _MAX_SKILL_FILE_BYTES / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds {max_mb:.0f} MiB limit",
        )

    file_repo = FileRepository(db)

    # Check total file count
    current_count = await file_repo.get_skill_file_count(skill.id)
    if current_count >= _MAX_SKILL_FILES:
        raise HTTPException(status_code=413, detail=f"Skill file limit reached ({_MAX_SKILL_FILES})")

    # Check total storage
    current_size = await file_repo.get_skill_total_size(skill.id)
    if current_size + file_size > _MAX_SKILL_TOTAL_BYTES:
        max_mb = _MAX_SKILL_TOTAL_BYTES / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Skill total storage limit exceeded ({max_mb:.0f} MiB)")

    # Resolve effective parent
    effective_parent = parent_id if parent_id else root_folder_id

    # Verify parent belongs to this skill
    if effective_parent != root_folder_id:
        parent_file = await file_repo.get_file_by_id(effective_parent)
        if not parent_file or not parent_file.is_dir or parent_file.skill_id != skill.id:
            raise HTTPException(status_code=400, detail="Invalid parent folder")

    # Detect content type
    content_type = file.content_type
    if not content_type or content_type == "application/octet-stream":
        content_type, _ = mimetypes.guess_type(file.filename)
        if not content_type and file.filename.lower().endswith(".md"):
            content_type = "text/markdown"
        if not content_type:
            content_type = "application/octet-stream"

    category = detect_file_category(file.filename)

    # Generate storage key and upload
    storage_key = generate_storage_key(
        user_id=user_id,
        filename=file.filename,
        scope=FileScope.PRIVATE,
        category=FileCategory(category) if category else None,
    )
    file_hash = hashlib.sha256(file_data).hexdigest()

    unique_filename = await file_repo.get_unique_name(user_id, effective_parent, file.filename, skill_id=skill.id)

    await storage.upload_file(
        file_data=BytesIO(file_data),
        storage_key=storage_key,
        content_type=content_type,
        metadata={"user_id": user_id, "skill_id": str(skill.id)},
    )

    file_record = await file_repo.create_file(
        FileCreate(
            user_id=user_id,
            storage_key=storage_key,
            original_filename=unique_filename,
            content_type=content_type,
            file_size=file_size,
            scope="private",
            category=category or "others",
            file_hash=file_hash,
            parent_id=effective_parent,
            skill_id=skill.id,
            status="confirmed",
        )
    )

    await db.commit()
    await db.refresh(file_record)

    return {
        "id": str(file_record.id),
        "name": file_record.original_filename,
        "file_size": file_record.file_size,
        "content_type": file_record.content_type,
        "parent_id": str(file_record.parent_id) if file_record.parent_id else None,
        "is_dir": False,
        "created_at": file_record.created_at.isoformat(),
        "updated_at": file_record.updated_at.isoformat(),
    }


@router.get("/{skill_id}/files/{file_id}/download")
async def download_skill_file(
    skill_id: UUID,
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Download a skill resource file."""
    skill = await _get_skill_for_resources(skill_id, user_id, db)

    file_repo = FileRepository(db)
    file_record = await file_repo.get_file_by_id(file_id)

    if not file_record or file_record.skill_id != skill.id:
        raise HTTPException(status_code=404, detail="File not found")
    if not file_record.storage_key:
        raise HTTPException(status_code=404, detail="Directory cannot be downloaded")

    file_stream = BytesIO()
    await storage.download_file(file_record.storage_key, file_stream)
    file_stream.seek(0)

    ascii_filename = file_record.original_filename.encode("ascii", "ignore").decode("ascii")
    utf8_filename = quote(file_record.original_filename.encode("utf-8"))

    return StreamingResponse(
        file_stream,
        media_type=file_record.content_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{utf8_filename}",
            "Content-Length": str(file_record.file_size),
        },
    )


@router.patch("/{skill_id}/files/{file_id}")
async def update_skill_file(
    skill_id: UUID,
    file_id: UUID,
    body: SkillFileUpdateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Rename or move a skill resource file."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)
    root_folder_id = await _ensure_root_folder(skill, user_id, db)

    file_repo = FileRepository(db)
    file_record = await file_repo.get_file_by_id(file_id)

    if not file_record or file_record.skill_id != skill.id or file_record.is_dir:
        raise HTTPException(status_code=404, detail="Skill file not found")

    update_data: dict[str, Any] = {}

    moving = "parent_id" in body.model_fields_set
    target_parent = file_record.parent_id

    if moving:
        target_parent = body.parent_id if body.parent_id else root_folder_id
        if target_parent != root_folder_id:
            parent_file = await file_repo.get_file_by_id(target_parent)
            if not parent_file or not parent_file.is_dir or parent_file.skill_id != skill.id:
                raise HTTPException(status_code=400, detail="Invalid target folder")
        update_data["parent_id"] = target_parent

    if body.original_filename is not None:
        if await file_repo.name_exists_in_parent(
            user_id,
            target_parent,
            body.original_filename,
            exclude_id=file_id,
            skill_id=skill.id,
        ):
            raise HTTPException(
                status_code=409,
                detail=f"An item named '{body.original_filename}' already exists",
            )
        update_data["original_filename"] = body.original_filename

    updated = await file_repo.update_file(file_id, FileUpdate(**update_data))
    if not updated:
        raise HTTPException(status_code=404, detail="File not found")

    await db.commit()
    await db.refresh(updated)

    return {
        "id": str(updated.id),
        "name": updated.original_filename,
        "parent_id": str(updated.parent_id) if updated.parent_id != root_folder_id else None,
    }


@router.delete("/{skill_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_file(
    skill_id: UUID,
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Hard-delete a skill resource file."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)

    file_repo = FileRepository(db)
    file_record = await file_repo.get_file_by_id(file_id)

    if not file_record or file_record.skill_id != skill.id or file_record.is_dir:
        raise HTTPException(status_code=404, detail="Skill file not found")

    if file_record.storage_key:
        await storage.delete_file(file_record.storage_key)

    await file_repo.hard_delete_file(file_id)
    await db.commit()


# --- Skill Folders ---


@router.post("/{skill_id}/folders", response_model=SkillFolderResponse, status_code=status.HTTP_201_CREATED)
async def create_skill_folder(
    skill_id: UUID,
    body: SkillFolderCreateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillFolderResponse:
    """Create a folder inside a skill's resource tree."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)
    root_folder_id = await _ensure_root_folder(skill, user_id, db)

    file_repo = FileRepository(db)

    effective_parent = body.parent_id if body.parent_id else root_folder_id
    if effective_parent != root_folder_id:
        parent = await file_repo.get_file_by_id(effective_parent)
        if not parent or not parent.is_dir or parent.skill_id != skill.id:
            raise HTTPException(status_code=400, detail="Invalid parent folder")

    if await file_repo.name_exists_in_parent(user_id, effective_parent, body.name, skill_id=skill.id):
        raise HTTPException(
            status_code=409,
            detail=f"An item named '{body.name}' already exists in this folder",
        )

    folder = await file_repo.create_file(
        FileCreate(
            user_id=user_id,
            original_filename=body.name,
            parent_id=effective_parent,
            is_dir=True,
            skill_id=skill.id,
            scope="private",
            category="others",
            status="confirmed",
            file_size=0,
        )
    )
    await db.commit()
    await db.refresh(folder)

    return SkillFolderResponse(
        id=folder.id,
        user_id=folder.user_id,
        parent_id=folder.parent_id if folder.parent_id != root_folder_id else None,
        name=folder.original_filename,
        is_deleted=folder.is_deleted,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
    )


@router.patch("/{skill_id}/folders/{folder_id}", response_model=SkillFolderResponse)
async def update_skill_folder(
    skill_id: UUID,
    folder_id: UUID,
    body: SkillFolderUpdateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SkillFolderResponse:
    """Rename or move a skill folder."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)
    root_folder_id = await _ensure_root_folder(skill, user_id, db)

    file_repo = FileRepository(db)
    folder = await file_repo.get_file_by_id(folder_id)

    if not folder or not folder.is_dir or folder.skill_id != skill.id:
        raise HTTPException(status_code=404, detail="Skill folder not found")
    if folder.id == root_folder_id:
        raise HTTPException(status_code=400, detail="Cannot modify root folder")

    update_data: dict[str, Any] = {}
    moving = "parent_id" in body.model_fields_set
    target_parent = folder.parent_id

    if moving:
        target_parent = body.parent_id if body.parent_id else root_folder_id
        if target_parent == folder_id:
            raise HTTPException(status_code=400, detail="Cannot move folder into itself")
        if await file_repo.is_descendant(folder_id, target_parent):
            raise HTTPException(status_code=400, detail="Cannot move folder into its own subfolder")
        if target_parent != root_folder_id:
            parent = await file_repo.get_file_by_id(target_parent)
            if not parent or not parent.is_dir or parent.skill_id != skill.id:
                raise HTTPException(status_code=400, detail="Invalid target folder")
        update_data["parent_id"] = target_parent

    if body.name is not None:
        if await file_repo.name_exists_in_parent(
            user_id,
            target_parent,
            body.name,
            exclude_id=folder_id,
            skill_id=skill.id,
        ):
            raise HTTPException(
                status_code=409,
                detail=f"An item named '{body.name}' already exists in this folder",
            )
        update_data["original_filename"] = body.name

    updated = await file_repo.update_file(folder_id, FileUpdate(**update_data))
    if not updated:
        raise HTTPException(status_code=404, detail="Folder not found")

    await db.commit()
    await db.refresh(updated)

    return SkillFolderResponse(
        id=updated.id,
        user_id=updated.user_id,
        parent_id=updated.parent_id if updated.parent_id != root_folder_id else None,
        name=updated.original_filename,
        is_deleted=updated.is_deleted,
        created_at=updated.created_at.isoformat(),
        updated_at=updated.updated_at.isoformat(),
    )


@router.delete("/{skill_id}/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_folder(
    skill_id: UUID,
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Hard-delete a skill folder and all its contents recursively."""
    skill = await _get_skill_for_resources(skill_id, user_id, db, require_writable=True)

    if skill.root_folder_id and folder_id == skill.root_folder_id:
        raise HTTPException(status_code=400, detail="Cannot delete root folder")

    file_repo = FileRepository(db)
    folder = await file_repo.get_file_by_id(folder_id)

    if not folder or not folder.is_dir or folder.skill_id != skill.id:
        raise HTTPException(status_code=404, detail="Skill folder not found")

    storage_keys = await file_repo.hard_delete_recursive(folder_id)
    if storage_keys:
        await storage.delete_files(storage_keys)

    await db.commit()


@router.get("/{skill_id}/folders/{folder_id}/path", response_model=list[SkillFolderResponse])
async def get_skill_folder_path(
    skill_id: UUID,
    folder_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SkillFolderResponse]:
    """Get the breadcrumb path for a skill folder."""
    skill = await _get_skill_for_resources(skill_id, user_id, db)

    file_repo = FileRepository(db)
    folder = await file_repo.get_file_by_id(folder_id)

    if not folder or not folder.is_dir or folder.skill_id != skill.id:
        raise HTTPException(status_code=404, detail="Skill folder not found")

    path = await file_repo.get_path(folder_id)

    # Filter out the root folder and ancestors above it
    result: list[SkillFolderResponse] = []
    for f in path:
        if f.id == skill.root_folder_id:
            continue
        result.append(
            SkillFolderResponse(
                id=f.id,
                user_id=f.user_id,
                parent_id=f.parent_id if f.parent_id != skill.root_folder_id else None,
                name=f.original_filename,
                is_deleted=f.is_deleted,
                created_at=f.created_at.isoformat(),
                updated_at=f.updated_at.isoformat(),
            )
        )

    return result


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
