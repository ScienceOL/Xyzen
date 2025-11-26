import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode
from models.provider import ProviderScope
from schemas.provider import LLMCredentials, RuntimeProviderConfig

from .config import ProviderType
from .factory import ChatModelFactory
from .startup import SYSTEM_PROVIDER_NAME

logger = logging.getLogger(__name__)


class ProviderManager:
    """
    Manager class for handling multiple LLM provider configurations
    and delegating creation to ChatModelFactory.
    """

    def __init__(self) -> None:
        self._provider_configs: dict[str, RuntimeProviderConfig] = {}
        self._active_provider: str | None = None
        self._factory = ChatModelFactory()

    def add_provider(
        self,
        name: str,
        provider_scope: ProviderScope,
        provider_type: ProviderType,
        api_key: SecretStr,
        api_endpoint: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        timeout: int | None = None,
        extra_config: dict[str, Any] | None = None,
    ) -> None:
        config_data = {
            "name": name,
            "provider_scope": provider_scope,
            "provider_type": provider_type,
            "api_key": api_key,
            "api_endpoint": api_endpoint,
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "timeout": timeout,
            "extra_config": extra_config,
        }

        self._provider_configs[name] = RuntimeProviderConfig.model_validate(config_data)

        if self._active_provider is None:
            self._active_provider = name

    def set_active_provider(self, name: str) -> None:
        """Set the active provider by name."""
        if name not in self._provider_configs:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider '{name}' not found")

        self._active_provider = name
        logger.info(f"Switched active provider to '{name}'")

    def get_provider_config(self, name: str | None = None) -> RuntimeProviderConfig | None:
        provider_name = name or self._active_provider
        if provider_name is None:
            return None
        return self._provider_configs.get(provider_name)

    def list_providers(self) -> list[RuntimeProviderConfig]:
        return list(self._provider_configs.values())

    def remove_provider(self, name: str) -> None:
        if name not in self._provider_configs:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider '{name}' not found")

        del self._provider_configs[name]

        if self._active_provider == name:
            if self._provider_configs:
                self._active_provider = next(iter(self._provider_configs))
            else:
                self._active_provider = None

        logger.info(f"Removed provider '{name}'")

    def create_langchain_model(self, name: str | None = None, **override_kwargs: Any) -> BaseChatModel:
        """
        Create a LangChain model using the stored config and the ChatModelFactory.

        Args:
            name: The provider name (optional, defaults to active)
            override_kwargs: Runtime overrides (e.g. temporary temperature change)
        """
        provider_name = name or self._active_provider
        if not provider_name:
            raise ErrCode.PROVIDER_NOT_AVAILABLE.with_messages("No active provider selected and no name provided")

        config = self._provider_configs.get(provider_name)
        if not config:
            logger.warning(f"Provider '{provider_name}' not found, using system provider")
            self.set_active_provider(SYSTEM_PROVIDER_NAME)
            config = self._provider_configs.get(SYSTEM_PROVIDER_NAME)
        logger.info(self._provider_configs)

        if not config:
            raise ErrCode.PROVIDER_NOT_AVAILABLE.with_messages("System provider not found")

        model_name = config.model
        credentials: LLMCredentials = config.to_credentials()
        # Directly use the extra_config attribute
        # which can be improved in the future
        runtime_kwargs = config.extra_config

        model_instance = self._factory.create(
            model=model_name,
            provider=config.provider_type,
            credentials=credentials,
            **runtime_kwargs,
        )

        return model_instance.llm


user_provider_managers: dict[str, ProviderManager] = {}


async def get_user_provider_manager(user_id: str, db: AsyncSession) -> ProviderManager:
    """
    Create a provider manager with all providers for a specific user.
    """
    if user_id in user_provider_managers:
        return user_provider_managers[user_id]

    from repos.provider import ProviderRepository

    provider_repo = ProviderRepository(db)
    all_providers = await provider_repo.get_providers_by_user(user_id, include_system=True)
    if not all_providers:
        raise ErrCode.PROVIDER_NOT_FOUND.with_messages("No providers found for user")
    user_provider_manager = ProviderManager()
    for db_provider in all_providers:
        try:
            provider_name = SYSTEM_PROVIDER_NAME if db_provider.scope == ProviderScope.SYSTEM else str(db_provider.id)

            extra_config: dict[str, Any] = db_provider.provider_config or {}
            logger.debug(f"Add {extra_config} to {provider_name}")
            user_provider_manager.add_provider(
                name=provider_name,
                provider_scope=db_provider.scope,
                provider_type=db_provider.provider_type,
                api_key=SecretStr(db_provider.key),
                api_endpoint=db_provider.api,
                model=db_provider.model,
                max_tokens=db_provider.max_tokens,
                temperature=db_provider.temperature,
                timeout=db_provider.timeout,
                extra_config=extra_config,
            )
        except Exception as e:
            logger.error(f"Failed to load provider {db_provider.name} for user {user_id}: {e}")
            continue

    available_names = [p.name for p in user_provider_manager.list_providers()]
    if SYSTEM_PROVIDER_NAME in available_names:
        user_provider_manager.set_active_provider(SYSTEM_PROVIDER_NAME)
        logger.debug(f"Using system provider as fallback for user {user_id}")
    elif available_names:
        user_provider_manager.set_active_provider(available_names[0])
        logger.debug(f"Using first available provider ({available_names[0]}) for user {user_id}")

    user_provider_managers[user_id] = user_provider_manager

    return user_provider_manager
