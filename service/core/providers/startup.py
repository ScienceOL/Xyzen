import logging

from sqlmodel.ext.asyncio.session import AsyncSession

from internal import configs
from internal.configs.llm import LLMConfig
from middleware.database.connection import AsyncSessionLocal
from models.provider import Provider, ProviderCreate, ProviderScope, ProviderUpdate
from repos.provider import ProviderRepository

logger = logging.getLogger(__name__)

SYSTEM_PROVIDER_NAME = "system"


class SystemProviderManager:
    def __init__(self, db: AsyncSession):
        self.repo = ProviderRepository(db)

    async def ensure_system_provider(self, llm_config: LLMConfig) -> Provider | None:
        """
        Ensure system provider exists and is up-to-date.
        Uses upsert pattern for cleaner logic.
        """
        if not llm_config.is_enabled:
            logger.info("LLM config not enabled, skipping system provider")
            return None

        try:
            existing = await self.repo.get_system_provider()

            if existing:
                provider_data = ProviderUpdate(
                    scope=ProviderScope.SYSTEM,
                    name=SYSTEM_PROVIDER_NAME,
                    provider_type=llm_config.provider,
                    api=llm_config.api,
                    key=llm_config.key.get_secret_value(),
                    model=llm_config.model,
                    provider_config=llm_config.to_extra_data(),
                )
                logger.debug(f"Updating system provider: {provider_data}")
                return await self._update_system_provider(existing, provider_data)
            else:
                provider_data = ProviderCreate(
                    scope=ProviderScope.SYSTEM,
                    user_id=None,
                    name=SYSTEM_PROVIDER_NAME,
                    provider_type=llm_config.provider,
                    api=llm_config.api,
                    key=llm_config.key.get_secret_value(),
                    model=llm_config.model,
                    provider_config=llm_config.to_extra_data(),
                )
                logger.debug(f"Creating system provider: {provider_data}")
                return await self._create_system_provider(provider_data)

        except Exception as e:
            logger.error(f"Failed to ensure system provider: {e}")
            logger.exception(e)
            return None

    async def _create_system_provider(self, provider_data: ProviderCreate) -> Provider:
        """Create new system provider."""
        logger.info("Creating new system provider")
        created = await self.repo.create_provider(provider_data, user_id=None)
        logger.info(f"System provider created: {created.model} (ID: {created.id})")
        return created

    async def _update_system_provider(self, existing: Provider, provider_data: ProviderUpdate) -> Provider:
        """Update existing system provider."""
        logger.info(f"Updating system provider: {existing.id}")
        exclude_fields = {"user_id", "scope", "id", "created_at"}
        update_data_dict = provider_data.model_dump(exclude_unset=True)
        update_fields = {}
        for k, v in update_data_dict.items():
            if k in exclude_fields:
                continue
            current_val = getattr(existing, k, None)
            if current_val != v:
                update_fields[k] = v

        if not update_fields:
            logger.info("System provider already up-to-date")
            return existing

        provider_update = ProviderUpdate.model_validate(update_fields)
        updated = await self.repo.update_provider(existing.id, provider_update)

        if not updated:
            raise RuntimeError("Failed to update system provider")

        logger.info(f"System provider updated: {updated.name}")
        return updated


async def initialize_providers_on_startup() -> None:
    """
    Initialize providers on startup with better error handling.
    """
    async with AsyncSessionLocal() as db:
        try:
            manager = SystemProviderManager(db)
            provider = await manager.ensure_system_provider(configs.LLM)
            if provider:
                await db.commit()
                logger.info(f"System provider ready: {provider.name} (Scope: {provider.scope})")
            else:
                logger.info("System provider skipped (not enabled)")
        except Exception as e:
            logger.error(f"Provider initialization failed: {e}")
            await db.rollback()
