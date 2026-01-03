import logging

from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import LLMConfig, configs
from app.infra.database import AsyncSessionLocal
from app.models.provider import Provider, ProviderCreate, ProviderScope, ProviderUpdate
from app.repos.provider import ProviderRepository

logger = logging.getLogger(__name__)

SYSTEM_PROVIDER_NAME = "system"


class SystemProviderManager:
    def __init__(self, db: AsyncSession):
        self.repo = ProviderRepository(db)

    async def ensure_system_providers(self, llm_config: LLMConfig) -> list[Provider]:
        """Ensure all configured system providers exist and are up-to-date."""
        logger.debug(f"Current LLM config: {llm_config}")
        if not llm_config.iter_enabled():
            logger.info("LLM config not enabled, skipping system providers")
            return []

        ensured: list[Provider] = []

        try:
            for provider_type, provider_cfg in llm_config.iter_enabled():
                system_name = {
                    "azure_openai": "AzureOpenAI",
                    "google_vertex": "GoogleVertex",
                    "openai": "OpenAI",
                    "google": "Google",
                }.get(provider_type.value, provider_type.value)
                existing = await self.repo.get_system_provider_by_type(provider_type)

                if existing:
                    provider_update_data: ProviderUpdate = ProviderUpdate(
                        scope=ProviderScope.SYSTEM,
                        name=system_name,
                        provider_type=provider_type,
                        api=provider_cfg.api,
                        key=provider_cfg.key.get_secret_value(),
                        model=provider_cfg.model,
                        provider_config=provider_cfg.to_extra_data(provider_type),
                    )
                    logger.debug(f"Updating system provider: {provider_update_data}")
                    ensured.append(await self._update_system_provider(existing, provider_update_data))
                else:
                    provider_create_data: ProviderCreate = ProviderCreate(
                        scope=ProviderScope.SYSTEM,
                        user_id=None,
                        name=system_name,
                        provider_type=provider_type,
                        api=provider_cfg.api,
                        key=provider_cfg.key.get_secret_value(),
                        model=provider_cfg.model,
                        provider_config=provider_cfg.to_extra_data(provider_type),
                    )
                    logger.debug(f"Creating system provider: {provider_create_data}")
                    ensured.append(await self._create_system_provider(provider_create_data))

            return ensured

        except Exception as e:
            logger.error(f"Failed to ensure system providers: {e}")
            logger.exception(e)
            return []

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
            providers = await manager.ensure_system_providers(configs.LLM)
            if providers:
                await db.commit()
                logger.info(f"System providers ready: {len(providers)}")
            else:
                logger.info("System provider skipped (not enabled)")
        except Exception as e:
            logger.error(f"Provider initialization failed: {e}")
            await db.rollback()
