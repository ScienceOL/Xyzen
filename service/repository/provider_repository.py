"""
This module contains the repository class for database operations related to the Provider model.
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.provider import Provider

logger = logging.getLogger(__name__)


class ProviderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_providers(self) -> List[Provider]:
        """Fetches all providers from the database."""
        logger.debug("Fetching all providers from the database")
        result = await self.db.exec(select(Provider))
        providers = result.all()
        logger.info(f"Found {len(providers)} providers in the database.")
        return list(providers)

    async def get_providers_by_user(self, user_id: str, include_system: bool = True) -> List[Provider]:
        """
        Fetches all providers for a specific user.

        Args:
            user_id: The user ID to fetch providers for
            include_system: If True, also include system provider in results
        """
        logger.debug(f"Fetching providers for user: {user_id}, include_system: {include_system}")

        if include_system:
            # Include both user's providers and system provider
            result = await self.db.exec(
                select(Provider).where((Provider.user_id == user_id) | (Provider.is_system == True))  # noqa: E712
            )
        else:
            # Only user's own providers
            result = await self.db.exec(
                select(Provider).where(Provider.user_id == user_id, Provider.is_system == False)  # noqa: E712
            )

        providers = result.all()
        logger.info(f"Found {len(providers)} providers for user {user_id}")
        return list(providers)

    async def get_provider_by_id(self, provider_id: UUID, user_id: Optional[str] = None) -> Optional[Provider]:
        """Fetches a single provider by ID, optionally filtered by user."""
        logger.debug(f"Fetching provider with ID: {provider_id}")
        if user_id:
            result = await self.db.exec(
                select(Provider).where(Provider.id == provider_id, Provider.user_id == user_id)
            )
        else:
            result = await self.db.exec(select(Provider).where(Provider.id == provider_id))

        provider = result.first()
        if provider:
            logger.info(f"Found provider: {provider.name}")
        else:
            logger.warning(f"Provider with ID {provider_id} not found")
        return provider

    async def get_default_provider(self, user_id: str) -> Optional[Provider]:
        """Fetches the default provider for a specific user."""
        logger.debug(f"Fetching default provider for user: {user_id}")
        result = await self.db.exec(
            select(Provider).where(Provider.user_id == user_id, Provider.is_default == True)  # noqa: E712
        )
        provider = result.first()
        if provider:
            logger.info(f"Found default provider: {provider.name} for user {user_id}")
        else:
            logger.info(f"No default provider found for user {user_id}")
        return provider

    async def create_provider(self, provider: Provider) -> Provider:
        """Creates a new provider in the database."""
        logger.debug(f"Creating provider: {provider.name}")
        self.db.add(provider)
        await self.db.commit()
        await self.db.refresh(provider)
        logger.info(f"Created provider: {provider.name} with ID: {provider.id}")
        return provider

    async def update_provider(self, provider: Provider) -> Provider:
        """Updates an existing provider in the database."""
        logger.debug(f"Updating provider: {provider.id}")
        self.db.add(provider)
        await self.db.commit()
        await self.db.refresh(provider)
        logger.info(f"Updated provider: {provider.name}")
        return provider

    async def delete_provider(self, provider: Provider) -> None:
        """Deletes a provider from the database."""
        logger.debug(f"Deleting provider: {provider.id}")
        await self.db.delete(provider)
        await self.db.commit()
        logger.info(f"Deleted provider: {provider.name}")

    async def set_default_provider(self, user_id: str, provider_id: UUID) -> Provider:
        """
        Sets a provider as the default for a user.
        Unsets any other default providers for the user atomically.
        """
        logger.debug(f"Setting provider {provider_id} as default for user {user_id}")

        # First, unset all default providers for this user
        result = await self.db.exec(
            select(Provider).where(Provider.user_id == user_id, Provider.is_default == True)  # noqa: E712
        )
        current_defaults = result.all()
        for provider in current_defaults:
            provider.is_default = False
            self.db.add(provider)

        # Now set the selected provider as default
        result = await self.db.exec(select(Provider).where(Provider.id == provider_id, Provider.user_id == user_id))
        target_provider = result.first()

        if not target_provider:
            raise ValueError(f"Provider {provider_id} not found for user {user_id}")

        target_provider.is_default = True
        self.db.add(target_provider)

        await self.db.commit()
        await self.db.refresh(target_provider)

        logger.info(f"Set provider {target_provider.name} as default for user {user_id}")
        return target_provider

    async def get_system_provider(self) -> Optional[Provider]:
        """
        Get the system-wide default provider.

        Returns:
            The system provider if it exists, None otherwise
        """
        logger.debug("Fetching system provider")
        result = await self.db.exec(select(Provider).where(Provider.is_system == True))  # noqa: E712
        provider = result.first()
        if provider:
            logger.info(f"Found system provider: {provider.name}")
        else:
            logger.debug("No system provider found")
        return provider
