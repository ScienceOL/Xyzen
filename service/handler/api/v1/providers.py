from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.auth import get_current_user
from middleware.database.connection import get_session
from models.provider import Provider, ProviderCreate, ProviderRead, ProviderUpdate
from repo.provider import ProviderRepository
from schemas.providers import PROVIDER_TEMPLATES, ProviderTemplate, ProviderType

router = APIRouter(tags=["providers"])


async def _verify_provider_authorization(
    provider_id: UUID, user: str, db: AsyncSession, allow_system: bool = False
) -> Provider | None:
    """
    Core authorization logic for provider access validation.

    Args:
        provider_id: UUID of the provider to verify
        user: Authenticated user ID
        db: Database session
        allow_system: If True, allows access to system providers

    Returns:
        Provider: The authorized provider instance, or None if not found

    Raises:
        HTTPException: 403 if access denied
    """
    provider_repo = ProviderRepository(db)
    provider = await provider_repo.get_provider_by_id(provider_id)

    if not provider:
        return None

    # Check if user owns the provider
    if provider.user_id == user:
        return provider

    # Check if it's a system provider and system access is allowed
    if allow_system and provider.is_system:
        return provider

    # Access denied
    raise HTTPException(status_code=403, detail="Access denied: You don't have permission to access this provider")


async def get_authorized_provider(
    provider_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> Provider:
    """
    FastAPI dependency that validates provider access authorization.

    Users can access their own providers and system providers.

    Args:
        provider_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Provider: The authorized provider instance

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied
    """
    provider = await _verify_provider_authorization(provider_id, user, db, allow_system=True)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


async def get_authorized_user_provider(
    provider_id: UUID, user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)
) -> Provider:
    """
    FastAPI dependency that validates user-owned provider access.

    Users can only access their own providers (no system providers).
    Used for operations that modify providers.

    Args:
        provider_id: UUID from the path parameter
        user: Authenticated user ID from get_current_user dependency
        db: Database session from get_session dependency

    Returns:
        Provider: The authorized user-owned provider instance

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied or system provider
    """
    provider = await _verify_provider_authorization(provider_id, user, db, allow_system=False)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system provider. System providers are read-only.")

    return provider


@router.get("/templates", response_model=List[ProviderTemplate])
async def get_provider_templates() -> List[ProviderTemplate]:
    """
    Get available provider templates with metadata for the UI.
    Returns configuration templates for all supported LLM providers.
    """
    return PROVIDER_TEMPLATES


@router.get("/me", response_model=List[ProviderRead])
async def get_my_providers(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[ProviderRead]:
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
    providers = await provider_repo.get_providers_by_user(user, include_system=True)

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
    user: str = Depends(get_current_user),
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
    created_provider = await provider_repo.create_provider(provider_data, user)

    await db.commit()
    return ProviderRead(**created_provider.model_dump())


@router.get("/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider: Provider = Depends(get_authorized_provider),
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
    # Authorization is handled by the dependency
    # Convert to response model and mask sensitive data for system providers
    provider_dict = provider.model_dump()
    if provider.is_system:
        provider_dict["key"] = "••••••••"
        provider_dict["api"] = "•••••••••••••••••"

    return ProviderRead(**provider_dict)


@router.patch("/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_data: ProviderUpdate,
    provider: Provider = Depends(get_authorized_user_provider),
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
    # Authorization is handled by the dependency
    # Validate provider_type if being updated
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
    updated_provider = await provider_repo.update_provider(provider.id, provider_data)
    if not updated_provider:
        # This should theoretically never happen since the dependency verified the provider exists
        raise HTTPException(status_code=500, detail="Failed to update provider")

    await db.commit()
    return ProviderRead(**updated_provider.model_dump())


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(
    provider: Provider = Depends(get_authorized_user_provider),
    db: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a provider.

    Users can only delete their own providers. System providers cannot be deleted.
    Authorization is handled by the dependency which ensures only user-owned
    providers can be deleted.

    Args:
        provider: Authorized user-owned provider instance (injected by dependency)
        db: Database session (injected by dependency)

    Returns:
        None: Always returns 204 No Content status

    Raises:
        HTTPException: 404 if provider not found, 403 if access denied or system provider
    """
    # Authorization is handled by the dependency
    provider_repo = ProviderRepository(db)
    success = await provider_repo.delete_provider(provider.id)

    if not success:
        # This should theoretically never happen since the dependency verified the provider exists
        raise HTTPException(status_code=500, detail="Failed to delete provider")

    await db.commit()
    return
