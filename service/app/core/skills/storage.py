"""
Skill OSS folder storage helpers.

One skill maps to one OSS folder (prefix):
  private/skills/{owner}/{skill_id}/
"""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

from app.core.storage import StorageServiceProto, get_storage_service

logger = logging.getLogger(__name__)

SKILL_MD_FILENAME = "SKILL.md"
MAX_SKILL_RESOURCE_FILES = 200
MAX_SKILL_RESOURCE_FILE_BYTES = 2 * 1024 * 1024  # 2 MiB per resource file
MAX_SKILL_RESOURCE_TOTAL_BYTES = 25 * 1024 * 1024  # 25 MiB across all resource files
MAX_SKILL_RESOURCE_PATH_LENGTH = 512


def build_skill_prefix(user_id: str | None, skill_id: UUID) -> str:
    """Build a stable OSS folder prefix for a skill."""
    owner = user_id if user_id else "builtin"
    return f"private/skills/{owner}/{skill_id}"


def _normalize_resource_path(path: str) -> str:
    """Validate and normalize a relative resource path."""
    normalized = path.strip().replace("\\", "/")
    if not normalized:
        raise ValueError("Resource path must not be empty")
    if normalized.startswith("/"):
        raise ValueError(f"Resource path must be relative: {path!r}")

    pure = PurePosixPath(normalized)
    if any(part in ("", ".", "..") for part in pure.parts):
        raise ValueError(f"Resource path contains invalid segments: {path!r}")
    if pure.name == SKILL_MD_FILENAME:
        raise ValueError(f"{SKILL_MD_FILENAME} is reserved")

    if len(normalized) > MAX_SKILL_RESOURCE_PATH_LENGTH:
        raise ValueError(f"Resource path exceeds max length {MAX_SKILL_RESOURCE_PATH_LENGTH}: {path!r}")

    return pure.as_posix()


def normalize_inline_resources(resources: list[dict[str, Any]] | None) -> list[tuple[str, str]]:
    """Validate inline resource payloads: [{path, content}, ...]."""
    if not resources:
        return []

    if len(resources) > MAX_SKILL_RESOURCE_FILES:
        raise ValueError(f"Too many resource files: {len(resources)} (max {MAX_SKILL_RESOURCE_FILES})")

    normalized: list[tuple[str, str]] = []
    seen_paths: set[str] = set()
    total_bytes = 0

    for idx, resource in enumerate(resources):
        if not isinstance(resource, dict):
            raise ValueError(f"Resource at index {idx} must be an object")

        raw_path = resource.get("path")
        if not isinstance(raw_path, str):
            raise ValueError(f"Resource at index {idx} is missing string 'path'")
        path = _normalize_resource_path(raw_path)

        content = resource.get("content")
        if not isinstance(content, str):
            raise ValueError(f"Resource '{path}' is missing string 'content'")

        try:
            content_bytes = len(content.encode("utf-8"))
        except UnicodeEncodeError as e:
            raise ValueError(f"Resource '{path}' is not valid UTF-8 text") from e

        if content_bytes > MAX_SKILL_RESOURCE_FILE_BYTES:
            raise ValueError(f"Resource '{path}' exceeds max size {MAX_SKILL_RESOURCE_FILE_BYTES} bytes")

        total_bytes += content_bytes
        if total_bytes > MAX_SKILL_RESOURCE_TOTAL_BYTES:
            raise ValueError(f"Total resource size exceeds max {MAX_SKILL_RESOURCE_TOTAL_BYTES} bytes")

        if path in seen_paths:
            raise ValueError(f"Duplicate resource path: {path}")
        seen_paths.add(path)
        normalized.append((path, content))

    return normalized


def _object_key(prefix: str, relative_path: str) -> str:
    return f"{prefix}/{relative_path}"


async def _put_text_file(
    storage: StorageServiceProto,
    storage_key: str,
    content: str,
    metadata: dict[str, str] | None = None,
) -> None:
    payload = content.encode("utf-8")
    await storage.upload_file(
        file_data=BytesIO(payload),
        storage_key=storage_key,
        content_type="text/plain; charset=utf-8",
        metadata=metadata,
    )


async def _list_prefix_keys(storage: StorageServiceProto, prefix: str) -> list[str]:
    files = await storage.list_files(prefix=f"{prefix}/")
    return [f.get("key", "") for f in files if isinstance(f.get("key"), str) and f.get("key")]


async def sync_skill_folder(
    *,
    prefix: str,
    skill_md: str,
    resources: list[dict[str, Any]] | None,
    storage: StorageServiceProto | None = None,
) -> list[str]:
    """
    Replace OSS folder content with SKILL.md + provided resources.

    Returns list of uploaded object keys.
    """
    normalized_resources = normalize_inline_resources(resources)
    storage_svc = storage or get_storage_service()

    existing_keys = set(await _list_prefix_keys(storage_svc, prefix))
    desired: dict[str, str] = {SKILL_MD_FILENAME: skill_md}
    desired.update({path: content for path, content in normalized_resources})

    uploaded_keys: list[str] = []
    try:
        for rel_path, content in desired.items():
            key = _object_key(prefix, rel_path)
            await _put_text_file(
                storage_svc,
                key,
                content,
                metadata={"relative_path": rel_path},
            )
            uploaded_keys.append(key)
    except Exception:
        # Best-effort rollback of files created during this attempt.
        if uploaded_keys:
            try:
                await storage_svc.delete_files(uploaded_keys)
            except Exception:
                logger.warning("Failed to cleanup uploaded skill files for prefix %s", prefix, exc_info=True)
        raise

    stale_keys = list(existing_keys - set(uploaded_keys))
    if stale_keys:
        try:
            await storage_svc.delete_files(stale_keys)
        except Exception:
            logger.warning("Failed to cleanup stale skill files for prefix %s", prefix, exc_info=True)

    return uploaded_keys


async def write_skill_md_only(
    *,
    prefix: str,
    skill_md: str,
    storage: StorageServiceProto | None = None,
) -> None:
    """Update only SKILL.md in an existing skill folder."""
    storage_svc = storage or get_storage_service()
    await _put_text_file(
        storage_svc,
        _object_key(prefix, SKILL_MD_FILENAME),
        skill_md,
        metadata={"relative_path": SKILL_MD_FILENAME},
    )


async def delete_skill_folder(
    prefix: str | None,
    *,
    storage: StorageServiceProto | None = None,
) -> None:
    """Delete all objects under a skill folder prefix."""
    if not prefix:
        return

    storage_svc = storage or get_storage_service()
    keys = await _list_prefix_keys(storage_svc, prefix)
    if keys:
        await storage_svc.delete_files(keys)


async def list_skill_resource_paths(
    prefix: str | None,
    *,
    storage: StorageServiceProto | None = None,
) -> list[str]:
    """List relative resource paths under a skill folder (excluding SKILL.md)."""
    if not prefix:
        return []

    storage_svc = storage or get_storage_service()
    keys = await _list_prefix_keys(storage_svc, prefix)
    base = f"{prefix}/"

    paths: list[str] = []
    for key in keys:
        if not key.startswith(base):
            continue
        rel_path = key[len(base) :]
        if rel_path and rel_path != SKILL_MD_FILENAME:
            paths.append(rel_path)

    paths.sort()
    return paths


async def load_skill_resource_files(
    prefix: str | None,
    *,
    storage: StorageServiceProto | None = None,
) -> list[dict[str, str]]:
    """Download all resource files for sandbox deployment (excluding SKILL.md)."""
    if not prefix:
        return []

    storage_svc = storage or get_storage_service()
    keys = await _list_prefix_keys(storage_svc, prefix)
    base = f"{prefix}/"

    result: list[dict[str, str]] = []
    for key in keys:
        if not key.startswith(base):
            continue
        rel_path = key[len(base) :]
        if not rel_path or rel_path == SKILL_MD_FILENAME:
            continue

        buffer = BytesIO()
        await storage_svc.download_file(key, buffer)
        result.append({"path": rel_path, "content": buffer.getvalue().decode("utf-8")})

    return result


async def load_skill_md(
    prefix: str | None,
    *,
    storage: StorageServiceProto | None = None,
) -> str | None:
    """Load SKILL.md content from OSS folder."""
    if not prefix:
        return None

    storage_svc = storage or get_storage_service()
    key = _object_key(prefix, SKILL_MD_FILENAME)
    exists = await storage_svc.file_exists(key)
    if not exists:
        return None

    buffer = BytesIO()
    await storage_svc.download_file(key, buffer)
    return buffer.getvalue().decode("utf-8")


__all__ = [
    "build_skill_prefix",
    "delete_skill_folder",
    "list_skill_resource_paths",
    "load_skill_md",
    "load_skill_resource_files",
    "normalize_inline_resources",
    "sync_skill_folder",
    "write_skill_md_only",
]
