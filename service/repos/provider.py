import logging
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.provider import Provider, ProviderCreate, ProviderScope, ProviderUpdate

logger = logging.getLogger(__name__)


class ProviderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_provider_by_id(self, provider_id: UUID) -> Provider | None:
        """
        Fetches a provider by its ID.

        Args:
            provider_id: The UUID of the provider to fetch.

        Returns:
            The Provider instance, or None if not found.
        """
        logger.debug(f"Fetching provider with id: {provider_id}")
        provider = await self.db.get(Provider, provider_id)
        return provider

    async def get_providers_by_user(self, user_id: str, include_system: bool = True) -> list[Provider]:
        """
        Fetches all providers for a specific user.

        Args:
            user_id: The user ID to fetch providers for
            include_system: If True, also include system providers in results

        Returns:
            List of Provider instances accessible to the user.
        """
        logger.debug(f"Fetching providers for user: {user_id}, include_system: {include_system}")

        if include_system:
            # Include both user's providers and system providers
            statement = select(Provider).where(
                (Provider.user_id == user_id) | (Provider.scope == ProviderScope.SYSTEM)  # noqa: E712
            )
        else:
            # Only user's own providers
            statement = select(Provider).where(Provider.user_id == user_id, Provider.scope == ProviderScope.USER)  # noqa: E712
        result = await self.db.exec(statement)
        providers = list(result.all())
        logger.debug(f"Found {len(providers)} providers for user {user_id}")
        return providers

    async def get_system_provider(self) -> Provider | None:
        """
        Fetches the system-wide default provider.

        Returns:
            The system Provider instance if it exists, None otherwise.
        """
        logger.debug("Fetching system provider")
        statement = select(Provider).where(Provider.scope == ProviderScope.SYSTEM)  # noqa: E712
        result = await self.db.exec(statement)
        provider = result.first()
        if provider:
            logger.debug(f"Found system provider: {provider.name}")
        return provider

    async def create_provider(self, provider_data: ProviderCreate, user_id: str | None) -> Provider:
        """
        Creates a new provider.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the provider object is populated with DB-defaults before being returned.

        Args:
            provider_data: The Pydantic model containing the data for the new provider.
            user_id: The user ID (from authentication).

        Returns:
            The newly created Provider instance.
        """
        logger.debug(f"Creating new provider for user_id: {user_id}")
        data = provider_data.model_dump(exclude_unset=True)
        data["user_id"] = user_id
        provider = Provider(**data)
        self.db.add(provider)
        await self.db.flush()
        await self.db.refresh(provider)
        return provider

    async def update_provider(self, provider_id: UUID, provider_data: ProviderUpdate) -> Provider | None:
        """
        Updates an existing provider.
        This function does NOT commit the transaction.

        Args:
            provider_id: The UUID of the provider to update.
            provider_data: The Pydantic model containing the update data.

        Returns:
            The updated Provider instance, or None if not found.
        """
        logger.debug(f"Updating provider with id: {provider_id}")
        provider = await self.db.get(Provider, provider_id)
        if not provider:
            return None

        # Only update fields that are not None to avoid null constraint violations
        # update_data = provider_data.model_dump(exclude_unset=True, exclude_none=True)
        # for field, value in update_data.items():
        #     if hasattr(provider, field):
        #         setattr(provider, field, value)
        update_data = provider_data.model_dump(exclude_unset=True, exclude_none=True)
        provider.sqlmodel_update(update_data)

        self.db.add(provider)
        await self.db.flush()
        await self.db.refresh(provider)
        return provider

    async def delete_provider(self, provider_id: UUID) -> bool:
        """
        Deletes a provider by its ID.
        This function does NOT commit the transaction.

        Args:
            provider_id: The UUID of the provider to delete.

        Returns:
            True if the provider was deleted, False if not found.
        """
        logger.debug(f"Deleting provider with id: {provider_id}")
        provider = await self.db.get(Provider, provider_id)
        if not provider:
            return False
        await self.db.delete(provider)
        await self.db.flush()
        return True
