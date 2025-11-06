from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code.error_code import ErrCodeError, handle_auth_error
from middleware.auth import get_current_user
from middleware.database.connection import get_session
from models.provider import ProviderCreate, ProviderRead, ProviderUpdate
from repo.provider import ProviderRepository
from schemas.providers import PROVIDER_TEMPLATES, ProviderTemplate, ProviderType
from core.auth import AuthorizationService, get_auth_service

router = APIRouter(tags=["providers"])


@router.get("/templates", response_model=list[ProviderTemplate])
async def get_provider_templates() -> list[ProviderTemplate]:
    """
    Get available provider templates with metadata for the UI.
    Returns configuration templates for all supported LLM providers.
    """
    return PROVIDER_TEMPLATES


@router.get("/me", response_model=list[ProviderRead])
async def get_my_providers(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ProviderRead]:
    """
    Get all providers accessible to the current authenticated user.

    Includes both user's own providers and system providers. System provider
    API keys and endpoints are masked for security reasons.

    Args:
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        List[ProviderRead]: List of providers accessible to the user

    Raises:
        HTTPException: None - this endpoint always succeeds, returning empty list if no providers
    """
    provider_repo = ProviderRepository(db)
    providers = await provider_repo.get_providers_by_user(user_id, include_system=True)

    # Convert to response models and mask sensitive data for system providers
    provider_reads = []
    for provider in providers:
        provider_dict = provider.model_dump()
        if provider.is_system:
            provider_dict["key"] = "••••••••"
            provider_dict["api"] = "•••••••••••••••••"
        provider_reads.append(ProviderRead(**provider_dict))

    return provider_reads


@router.post("/", response_model=ProviderRead, status_code=201)
async def create_provider(
    provider_data: ProviderCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ProviderRead:
    """
    Create a new provider for the current authenticated user.

    The user_id is automatically set from the authenticated user context.
    If this is the user's first provider, it will automatically be set as default.

    Args:
        provider_data: Provider creation data
        user: Authenticated user ID (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        ProviderRead: The newly created provider

    Raises:
        HTTPException: 400 if invalid provider_type, 500 if creation fails
    """
    # Validate provider_type
    try:
        ProviderType(provider_data.provider_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider_type: {provider_data.provider_type}. "
            f"Must be one of: {[pt.value for pt in ProviderType]}",
        )

    provider_repo = ProviderRepository(db)

    # Create provider using repository
    created_provider = await provider_repo.create_provider(provider_data, user_id)

    # Convert to ProviderRead by constructing the dict manually
    # BEFORE committing, to avoid detached SQLAlchemy instance issues
    provider_dict: dict[str, Any] = {
        "id": created_provider.id,
        "user_id": created_provider.user_id,
        "name": created_provider.name,
        "provider_type": created_provider.provider_type,
        "api": created_provider.api,
        "key": created_provider.key,
        "timeout": created_provider.timeout,
        "model": created_provider.model,
        "max_tokens": created_provider.max_tokens,
        "temperature": created_provider.temperature,
        "is_system": created_provider.is_system,
        "provider_config": created_provider.provider_config,
    }

    await db.commit()
    return ProviderRead(**provider_dict)


@router.get("/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
) -> ProviderRead:
    """
    Get a single provider by ID.

    Users can access their own providers and system providers. System provider
    API keys and endpoints are masked for security reasons.

    Args:
        provider: Authorized provider instance (injected by dependency)

    Returns:
        ProviderRead: The requested provider with masked sensitive data

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied
    """
    try:
        provider = await auth_service.authorize_provider_read(provider_id, user_id)
    except ErrCodeError as e:
        raise handle_auth_error(e)

    provider_dict = provider.model_dump()
    if provider.is_system:
        provider_dict["key"] = "••••••••"
        provider_dict["api"] = "•••••••••••••••••"

    return ProviderRead(**provider_dict)


@router.patch("/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: UUID,
    provider_data: ProviderUpdate,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> ProviderRead:
    """
    Update an existing provider.

    Users can only update their own providers. System providers cannot be updated.
    Authorization is handled by the dependency which ensures only user-owned
    providers can be modified.

    Args:
        provider_data: Partial update data (only provided fields will be updated)
        provider: Authorized user-owned provider instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        ProviderRead: The updated provider

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied or system provider,
                      400 if invalid provider_type, 500 if update fails
    """
    try:
        await auth_service.authorize_provider_write(provider_id, user_id)

        if provider_data.provider_type is not None:
            try:
                ProviderType(provider_data.provider_type)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid provider_type: {provider_data.provider_type}. "
                    f"Must be one of: {[pt.value for pt in ProviderType]}",
                )

        provider_repo = ProviderRepository(db)
        updated_provider = await provider_repo.update_provider(provider_id, provider_data)
        if not updated_provider:
            raise HTTPException(status_code=500, detail="Failed to update provider")

        # Convert to ProviderRead by constructing the dict manually
        # BEFORE committing, to avoid detached SQLAlchemy instance issues
        provider_dict: dict[str, Any] = {
            "id": updated_provider.id,
            "user_id": updated_provider.user_id,
            "name": updated_provider.name,
            "provider_type": updated_provider.provider_type,
            "api": updated_provider.api,
            "key": updated_provider.key,
            "timeout": updated_provider.timeout,
            "model": updated_provider.model,
            "max_tokens": updated_provider.max_tokens,
            "temperature": updated_provider.temperature,
            "is_system": updated_provider.is_system,
            "provider_config": updated_provider.provider_config,
        }

        await db.commit()
        return ProviderRead(**provider_dict)

    except ErrCodeError as e:
        raise handle_auth_error(e)


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: UUID,
    user_id: str = Depends(get_current_user),
    auth_service: AuthorizationService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a provider.

    Users can only delete their own providers. System providers cannot be deleted.

    Args:
        provider: Authorized user-owned provider instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied or system provider
    """
    try:
        provider = await auth_service.authorize_provider_delete(provider_id, user_id)

        provider_repo = ProviderRepository(db)
        success = await provider_repo.delete_provider(provider.id)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete provider")

        await db.commit()
        return
    except ErrCodeError as e:
        raise handle_auth_error(e)
