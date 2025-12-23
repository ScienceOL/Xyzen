"""Utility functions for cleaning up orphaned and expired files."""

import logging
from datetime import datetime, timezone

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.storage import StorageServiceProto, get_storage_service
from app.models.file import File
from app.models.message import Message
from app.repos.file import FileRepository

logger = logging.getLogger(__name__)


async def cleanup_orphaned_files(
    db: AsyncSession,
    storage: StorageServiceProto | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Clean up files that reference non-existent messages (orphaned files).

    This function finds all file records where:
    - message_id is not null
    - The referenced message doesn't exist in the database

    Args:
        db: Database session
        storage: Storage service instance (will create one if not provided)
        dry_run: If True, only count orphaned files without deleting them

    Returns:
        Dictionary with statistics:
        - orphaned_count: Number of orphaned files found
        - deleted_from_storage: Number of files deleted from object storage
        - deleted_from_db: Number of file records deleted from database
        - failed: Number of files that failed to delete
    """
    logger.info(f"Starting orphaned files cleanup (dry_run={dry_run})")

    stats = {
        "orphaned_count": 0,
        "deleted_from_storage": 0,
        "deleted_from_db": 0,
        "failed": 0,
    }

    # Get storage service
    if storage is None:
        storage = get_storage_service()

    file_repo = FileRepository(db)

    # Find all files with message_id set
    statement = select(File).where(
        col(File.message_id).isnot(None),
        col(File.is_deleted).is_(False),
    )
    result = await db.exec(statement)
    files_with_message = list(result.all())

    logger.info(f"Found {len(files_with_message)} files with message_id set")

    # Check which ones are orphaned
    orphaned_files: list[File] = []
    for file in files_with_message:
        message = await db.get(Message, file.message_id)
        if not message:
            orphaned_files.append(file)

    stats["orphaned_count"] = len(orphaned_files)
    logger.info(f"Found {len(orphaned_files)} orphaned files")

    if dry_run:
        logger.info("Dry run mode - not deleting files")
        return stats

    # Delete orphaned files
    if orphaned_files:
        storage_keys = [file.storage_key for file in orphaned_files]

        # Delete from object storage
        try:
            await storage.delete_files(storage_keys)
            stats["deleted_from_storage"] = len(storage_keys)
            logger.info(f"Deleted {len(storage_keys)} files from storage")
        except Exception as e:
            logger.error(f"Failed to delete files from storage: {e}")
            stats["failed"] = len(storage_keys)

        # Delete from database
        for file in orphaned_files:
            try:
                await file_repo.hard_delete_file(file.id)
                stats["deleted_from_db"] += 1
            except Exception as e:
                logger.error(f"Failed to delete file record {file.id}: {e}")
                stats["failed"] += 1

        await db.commit()

    logger.info(f"Orphaned files cleanup completed: {stats}")
    return stats


async def cleanup_expired_pending_files(
    db: AsyncSession,
    storage: StorageServiceProto | None = None,
    expiration_hours: int = 24,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Clean up pending files that have expired (not confirmed to a message).

    Pending files are uploaded but not yet attached to a message.
    If they remain in pending status for too long, they should be cleaned up.

    Args:
        db: Database session
        storage: Storage service instance (will create one if not provided)
        expiration_hours: Number of hours after which pending files expire
        dry_run: If True, only count expired files without deleting them

    Returns:
        Dictionary with statistics:
        - expired_count: Number of expired pending files found
        - deleted_from_storage: Number of files deleted from object storage
        - deleted_from_db: Number of file records deleted from database
        - failed: Number of files that failed to delete
    """
    logger.info(f"Starting expired pending files cleanup (expiration_hours={expiration_hours}, dry_run={dry_run})")

    stats = {
        "expired_count": 0,
        "deleted_from_storage": 0,
        "deleted_from_db": 0,
        "failed": 0,
    }

    # Get storage service
    if storage is None:
        storage = get_storage_service()

    file_repo = FileRepository(db)

    # Calculate cutoff time
    cutoff_time = datetime.now(timezone.utc).timestamp() - (expiration_hours * 3600)
    cutoff_datetime = datetime.fromtimestamp(cutoff_time, tz=timezone.utc)

    # Find expired pending files
    statement = (
        select(File)
        .where(File.status == "pending")
        .where(col(File.message_id).is_(None))
        .where(File.created_at <= cutoff_datetime)
        .where(col(File.is_deleted).is_(False))
    )
    result = await db.exec(statement)
    expired_files = list(result.all())

    stats["expired_count"] = len(expired_files)
    logger.info(f"Found {len(expired_files)} expired pending files")

    if dry_run:
        logger.info("Dry run mode - not deleting files")
        return stats

    # Delete expired files
    if expired_files:
        storage_keys = [file.storage_key for file in expired_files]

        # Delete from object storage
        try:
            await storage.delete_files(storage_keys)
            stats["deleted_from_storage"] = len(storage_keys)
            logger.info(f"Deleted {len(storage_keys)} files from storage")
        except Exception as e:
            logger.error(f"Failed to delete files from storage: {e}")
            stats["failed"] = len(storage_keys)

        # Delete from database
        for file in expired_files:
            try:
                await file_repo.hard_delete_file(file.id)
                stats["deleted_from_db"] += 1
            except Exception as e:
                logger.error(f"Failed to delete file record {file.id}: {e}")
                stats["failed"] += 1

        await db.commit()

    logger.info(f"Expired pending files cleanup completed: {stats}")
    return stats


async def cleanup_old_soft_deleted_files(
    db: AsyncSession,
    storage: StorageServiceProto | None = None,
    retention_days: int = 30,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Permanently delete files that have been soft-deleted for more than the retention period.

    Args:
        db: Database session
        storage: Storage service instance (will create one if not provided)
        retention_days: Number of days to keep soft-deleted files before permanent deletion
        dry_run: If True, only count files without deleting them

    Returns:
        Dictionary with statistics:
        - old_deleted_count: Number of old soft-deleted files found
        - deleted_from_storage: Number of files deleted from object storage
        - deleted_from_db: Number of file records deleted from database
        - failed: Number of files that failed to delete
    """
    logger.info(f"Starting old soft-deleted files cleanup (retention_days={retention_days}, dry_run={dry_run})")

    stats = {
        "old_deleted_count": 0,
        "deleted_from_storage": 0,
        "deleted_from_db": 0,
        "failed": 0,
    }

    # Get storage service
    if storage is None:
        storage = get_storage_service()

    file_repo = FileRepository(db)

    # Use the existing cleanup method from FileRepository
    if dry_run:
        # Calculate cutoff time
        cutoff_time = datetime.now(timezone.utc).timestamp() - (retention_days * 24 * 3600)
        cutoff_datetime = datetime.fromtimestamp(cutoff_time, tz=timezone.utc)

        # Count old soft-deleted files
        statement = select(File).where(col(File.is_deleted).is_(True)).where(col(File.deleted_at) <= cutoff_datetime)
        result = await db.exec(statement)
        old_files = list(result.all())
        stats["old_deleted_count"] = len(old_files)
        logger.info(f"Found {len(old_files)} old soft-deleted files (dry run)")
    else:
        # Get files before deletion to get storage keys
        cutoff_time = datetime.now(timezone.utc).timestamp() - (retention_days * 24 * 3600)
        cutoff_datetime = datetime.fromtimestamp(cutoff_time, tz=timezone.utc)

        statement = select(File).where(col(File.is_deleted).is_(True)).where(col(File.deleted_at) <= cutoff_datetime)
        result = await db.exec(statement)
        old_files = list(result.all())

        stats["old_deleted_count"] = len(old_files)

        if old_files:
            storage_keys = [file.storage_key for file in old_files]

            # Delete from object storage
            try:
                await storage.delete_files(storage_keys)
                stats["deleted_from_storage"] = len(storage_keys)
                logger.info(f"Deleted {len(storage_keys)} files from storage")
            except Exception as e:
                logger.error(f"Failed to delete files from storage: {e}")
                stats["failed"] = len(storage_keys)

            # Delete from database using repository method
            deleted_count = await file_repo.cleanup_old_deleted_files(retention_days)
            stats["deleted_from_db"] = deleted_count

            await db.commit()

    logger.info(f"Old soft-deleted files cleanup completed: {stats}")
    return stats


async def run_full_cleanup(
    db: AsyncSession,
    storage: StorageServiceProto | None = None,
    expiration_hours: int = 24,
    retention_days: int = 30,
    dry_run: bool = False,
) -> dict[str, dict[str, int]]:
    """
    Run all cleanup operations in sequence.

    Args:
        db: Database session
        storage: Storage service instance (will create one if not provided)
        expiration_hours: Hours after which pending files expire
        retention_days: Days to keep soft-deleted files
        dry_run: If True, only report without deleting

    Returns:
        Dictionary with all cleanup statistics
    """
    logger.info(f"Starting full cleanup (dry_run={dry_run})")

    results = {}

    # Cleanup orphaned files
    results["orphaned_files"] = await cleanup_orphaned_files(db, storage, dry_run)

    # Cleanup expired pending files
    results["expired_pending_files"] = await cleanup_expired_pending_files(db, storage, expiration_hours, dry_run)

    # Cleanup old soft-deleted files
    results["old_soft_deleted_files"] = await cleanup_old_soft_deleted_files(db, storage, retention_days, dry_run)

    logger.info(f"Full cleanup completed: {results}")
    return results
