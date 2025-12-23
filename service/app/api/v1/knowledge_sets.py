import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode, ErrCodeError, handle_auth_error
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.knowledge_set import (
    KnowledgeSetCreate,
    KnowledgeSetRead,
    KnowledgeSetUpdate,
    KnowledgeSetWithFileCount,
)
from app.repos.file import FileRepository
from app.repos.knowledge_set import KnowledgeSetRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge_sets"])


@router.post("/", response_model=KnowledgeSetRead, status_code=status.HTTP_201_CREATED)
async def create_knowledge_set(
    knowledge_set_create: KnowledgeSetCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> KnowledgeSetRead:
    """
    Create a new knowledge set.

    Args:
        knowledge_set_create: Knowledge set creation data
        user_id: Authenticated user ID
        db: Database session

    Returns:
        KnowledgeSetRead: Created knowledge set
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.create_knowledge_set(knowledge_set_create, user_id)
        await db.commit()
        await db.refresh(knowledge_set)

        return KnowledgeSetRead(**knowledge_set.model_dump())

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to create knowledge set: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/", response_model=list[KnowledgeSetWithFileCount])
async def list_knowledge_sets(
    include_deleted: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[KnowledgeSetWithFileCount]:
    """
    List knowledge sets for the current user.

    Args:
        include_deleted: Whether to include soft-deleted knowledge sets
        user_id: Authenticated user ID
        db: Database session

    Returns:
        list[KnowledgeSetWithFileCount]: List of knowledge sets with file counts
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_sets = await knowledge_set_repo.get_knowledge_sets_by_user(
            user_id=user_id,
            include_deleted=include_deleted,
        )

        # Enrich with file counts
        result = []
        for ks in knowledge_sets:
            file_count = await knowledge_set_repo.get_file_count_in_knowledge_set(ks.id)
            result.append(
                KnowledgeSetWithFileCount(
                    **ks.model_dump(),
                    file_count=file_count,
                )
            )

        return result

    except Exception as e:
        logger.error(f"Failed to list knowledge sets: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{knowledge_set_id}", response_model=KnowledgeSetWithFileCount)
async def get_knowledge_set(
    knowledge_set_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> KnowledgeSetWithFileCount:
    """
    Get knowledge set details by ID.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)

        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")

        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        file_count = await knowledge_set_repo.get_file_count_in_knowledge_set(knowledge_set_id)

        return KnowledgeSetWithFileCount(
            **knowledge_set.model_dump(),
            file_count=file_count,
        )

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.patch("/{knowledge_set_id}", response_model=KnowledgeSetRead)
async def update_knowledge_set(
    knowledge_set_id: UUID,
    knowledge_set_update: KnowledgeSetUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> KnowledgeSetRead:
    """
    Update knowledge set details.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)

        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")

        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        updated_knowledge_set = await knowledge_set_repo.update_knowledge_set(knowledge_set_id, knowledge_set_update)
        if updated_knowledge_set:
            await db.commit()
            await db.refresh(updated_knowledge_set)
            return KnowledgeSetRead(**updated_knowledge_set.model_dump())
        else:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to update knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete("/{knowledge_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_set(
    knowledge_set_id: UUID,
    hard_delete: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a knowledge set.
    Default: Soft delete (hides knowledge set).
    Hard delete: Permanently destroys knowledge set and all file links.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)

        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")

        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        if hard_delete:
            await knowledge_set_repo.hard_delete_knowledge_set(knowledge_set_id)
        else:
            await knowledge_set_repo.soft_delete_knowledge_set(knowledge_set_id)

        await db.commit()

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to delete knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{knowledge_set_id}/files/{file_id}", status_code=status.HTTP_201_CREATED)
async def link_file_to_knowledge_set(
    knowledge_set_id: UUID,
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Link a file to a knowledge set.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        file_repo = FileRepository(db)

        # Verify knowledge set exists and user has access
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)
        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        # Verify file exists and user has access
        file = await file_repo.get_file_by_id(file_id)
        if not file:
            raise ErrCode.FILE_NOT_FOUND.with_messages("File not found")
        if file.user_id != user_id:
            raise ErrCode.FILE_ACCESS_DENIED.with_messages("File access denied")

        # Create the link
        link = await knowledge_set_repo.link_file_to_knowledge_set(file_id, knowledge_set_id)
        if not link:
            raise ErrCode.KNOWLEDGE_SET_LINK_EXISTS.with_messages("File already linked to knowledge set")

        await db.commit()

        return {"message": "File linked to knowledge set successfully"}

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to link file {file_id} to knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete("/{knowledge_set_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_file_from_knowledge_set(
    knowledge_set_id: UUID,
    file_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Unlink a file from a knowledge set.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)

        # Verify knowledge set exists and user has access
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)
        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        # Unlink the file
        success = await knowledge_set_repo.unlink_file_from_knowledge_set(file_id, knowledge_set_id)
        if not success:
            raise ErrCode.KNOWLEDGE_SET_LINK_NOT_FOUND.with_messages("Link not found")

        await db.commit()

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to unlink file {file_id} from knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{knowledge_set_id}/files", response_model=list[UUID])
async def get_files_in_knowledge_set(
    knowledge_set_id: UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[UUID]:
    """
    Get all file IDs linked to a knowledge set.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)

        # Verify knowledge set exists and user has access
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)
        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        file_ids = await knowledge_set_repo.get_files_in_knowledge_set(knowledge_set_id)
        return file_ids

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to get files in knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{knowledge_set_id}/files/bulk-link")
async def bulk_link_files_to_knowledge_set(
    knowledge_set_id: UUID,
    file_ids: list[UUID],
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Link multiple files to a knowledge set.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)
        file_repo = FileRepository(db)

        # Verify knowledge set exists and user has access
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)
        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        # Verify all files exist and user has access
        for file_id in file_ids:
            file = await file_repo.get_file_by_id(file_id)
            if not file:
                raise ErrCode.FILE_NOT_FOUND.with_messages(f"File {file_id} not found")
            if file.user_id != user_id:
                raise ErrCode.FILE_ACCESS_DENIED.with_messages(f"File {file_id} access denied")

        # Bulk link
        successful, skipped = await knowledge_set_repo.bulk_link_files_to_knowledge_set(file_ids, knowledge_set_id)
        await db.commit()

        return {
            "message": f"Linked {successful} files, skipped {skipped} existing links",
            "successful": successful,
            "skipped": skipped,
        }

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to bulk link files to knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/{knowledge_set_id}/files/bulk-unlink")
async def bulk_unlink_files_from_knowledge_set(
    knowledge_set_id: UUID,
    file_ids: list[UUID],
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Unlink multiple files from a knowledge set.
    """
    try:
        knowledge_set_repo = KnowledgeSetRepository(db)

        # Verify knowledge set exists and user has access
        knowledge_set = await knowledge_set_repo.get_knowledge_set_by_id(knowledge_set_id)
        if not knowledge_set:
            raise ErrCode.KNOWLEDGE_SET_NOT_FOUND.with_messages("Knowledge set not found")
        if knowledge_set.user_id != user_id:
            raise ErrCode.KNOWLEDGE_SET_ACCESS_DENIED.with_messages("Access denied")

        # Bulk unlink
        count = await knowledge_set_repo.bulk_unlink_files_from_knowledge_set(file_ids, knowledge_set_id)
        await db.commit()

        return {
            "message": f"Unlinked {count} files from knowledge set",
            "count": count,
        }

    except ErrCodeError as e:
        raise handle_auth_error(e)
    except Exception as e:
        logger.error(f"Failed to bulk unlink files from knowledge set {knowledge_set_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
