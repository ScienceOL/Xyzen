from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from middleware.auth import get_current_user
from middleware.database.connection import get_session
from models.provider import Provider, ProviderCreate, ProviderUpdate
from repository.provider_repository import ProviderRepository
from schemas.providers import PROVIDER_TEMPLATES, ProviderTemplate, ProviderType

router = APIRouter()


@router.get("/templates", response_model=List[ProviderTemplate])
async def get_provider_templates() -> List[ProviderTemplate]:
    """
    Get available provider templates with metadata for the UI.
    Returns configuration templates for all supported LLM providers.
    """
    return PROVIDER_TEMPLATES


@router.get("/me", response_model=List[Provider])
async def get_my_providers(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
) -> List[Provider]:
    """
    Get all providers for the current authenticated user.
    Includes system provider (for selection in agents) but not user's own providers marked as system.
    System provider API keys are masked for security.
    """
    provider_repo = ProviderRepository(session)
    # include_system=True so users can select system provider for their agents
    providers = await provider_repo.get_providers_by_user(user, include_system=True)

    # Mask API key for system providers
    for provider in providers:
        if provider.is_system:
            provider.key = "••••••••"

    return providers


@router.get("/me/default", response_model=Provider)
async def get_my_default_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
) -> Provider:
    """
    Get the default provider for the current authenticated user.
    System provider API keys are masked for security.
    """
    provider_repo = ProviderRepository(session)
    provider = await provider_repo.get_default_provider(user)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No default provider found. Please set a default provider.",
        )

    # Mask API key for system provider
    if provider.is_system:
        provider.key = "••••••••"

    return provider


@router.post("/me/default/{provider_id}", response_model=Provider)
async def set_my_default_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    provider_id: UUID,
) -> Provider:
    """
    Set a provider as the default for the current authenticated user.
    This will unset any other default providers for the user.
    """
    provider_repo = ProviderRepository(session)
    try:
        provider = await provider_repo.set_default_provider(user, provider_id)
        return provider
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/", response_model=Provider, status_code=status.HTTP_201_CREATED)
async def create_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    provider_data: ProviderCreate,
) -> Provider:
    """
    Create a new provider for the current authenticated user.
    The user_id is automatically set from the authenticated user.
    """
    # Validate provider_type
    try:
        ProviderType(provider_data.provider_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider_type: {provider_data.provider_type}. "
            f"Must be one of: {[pt.value for pt in ProviderType]}",
        )

    # Create provider with authenticated user_id
    provider = Provider.model_validate(provider_data)
    provider.user_id = user  # Override with authenticated user

    provider_repo = ProviderRepository(session)
    created_provider = await provider_repo.create_provider(provider)

    # If this is the user's first provider, set it as default
    user_providers = await provider_repo.get_providers_by_user(user)
    if len(user_providers) == 1:
        await provider_repo.set_default_provider(user, created_provider.id)
        await session.refresh(created_provider)

    return created_provider


@router.get("/{provider_id}", response_model=Provider)
async def get_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    provider_id: UUID,
) -> Provider:
    """
    Get a single provider by ID.
    Users can only access their own providers or the system provider.
    System provider API keys are masked for security.
    """
    provider_repo = ProviderRepository(session)
    provider = await provider_repo.get_provider_by_id(provider_id, user_id=user)

    # Also allow access to system provider
    if not provider:
        system_provider = await provider_repo.get_system_provider()
        if system_provider and system_provider.id == provider_id:
            provider = system_provider

    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    # Mask API key for system provider
    if provider.is_system:
        provider.key = "••••••••"

    return provider


@router.patch("/{provider_id}", response_model=Provider)
async def update_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    provider_id: UUID,
    provider_data: ProviderUpdate,
) -> Provider:
    """
    Update a provider.
    Users can only update their own providers. System providers cannot be updated.
    """
    provider_repo = ProviderRepository(session)
    db_provider = await provider_repo.get_provider_by_id(provider_id, user_id=user)
    if not db_provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    # Block updates to system provider
    if db_provider.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update system provider. System providers are read-only.",
        )

    # Validate provider_type if being updated
    if provider_data.provider_type is not None:
        try:
            ProviderType(provider_data.provider_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid provider_type: {provider_data.provider_type}",
            )

    # Update fields
    update_data = provider_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_provider, key, value)

    updated_provider = await provider_repo.update_provider(db_provider)
    return updated_provider


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    provider_id: UUID,
) -> None:
    """
    Delete a provider.
    Users can only delete their own providers. System providers cannot be deleted.
    """
    provider_repo = ProviderRepository(session)
    provider = await provider_repo.get_provider_by_id(provider_id, user_id=user)
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    # Block deletion of system provider
    if provider.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete system provider. System providers are read-only.",
        )

    await provider_repo.delete_provider(provider)
    return None
