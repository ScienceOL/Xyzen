import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode
from models.provider import ProviderScope
from schemas.provider import LLMCredentials, ProviderType, RuntimeProviderConfig

from .factory import ChatModelFactory
from .startup import SYSTEM_PROVIDER_NAME

logger = logging.getLogger(__name__)


class ProviderManager:
    """
    Manager class for handling multiple LLM provider configurations
    and delegating creation to ChatModelFactory.
    Now works directly with provider_id and model from session/agent,
    no longer maintains active provider state.
    """

    def __init__(self) -> None:
        self._provider_configs: dict[str, RuntimeProviderConfig] = {}
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

    def get_provider_config(self, provider_id: str) -> RuntimeProviderConfig | None:
        """Get provider config by provider ID."""
        return self._provider_configs.get(provider_id)

    def list_providers(self) -> list[RuntimeProviderConfig]:
        return list(self._provider_configs.values())

    def remove_provider(self, name: str) -> None:
        if name not in self._provider_configs:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider '{name}' not found")

        del self._provider_configs[name]
        logger.info(f"Removed provider '{name}'")

    def create_langchain_model(
        self, provider_id: str | None = None, model: str | None = None, **override_kwargs: Any
    ) -> BaseChatModel:
        """
        Create a LangChain model using the stored config and the ChatModelFactory.

        Args:
            provider_id: The provider ID (UUID string). If None, uses system provider as fallback.
            model: The model name to use. Required.
            override_kwargs: Runtime overrides (e.g. temperature, max_tokens)

        Returns:
            BaseChatModel: Configured LangChain model instance

        Raises:
            ErrCode.PROVIDER_NOT_AVAILABLE: If no provider found and system fallback fails
            ErrCode.MODEL_NOT_SPECIFIED: If model is not provided
        """
        if not model:
            raise ErrCode.MODEL_NOT_SPECIFIED.with_messages("Model must be specified")

        # If no provider specified, try system provider as fallback
        if not provider_id:
            provider_id = SYSTEM_PROVIDER_NAME
            logger.info("No provider specified, using system provider as fallback")

        config = self._provider_configs.get(provider_id)

        # If provider not found, try system provider as fallback
        if not config:
            logger.warning(f"Provider '{provider_id}' not found, falling back to system provider")
            config = self._provider_configs.get(SYSTEM_PROVIDER_NAME)

        if not config:
            raise ErrCode.PROVIDER_NOT_AVAILABLE.with_messages("No provider available (including system fallback)")

        credentials: LLMCredentials = config.to_credentials()
        runtime_kwargs = (config.extra_config or {}).copy()
        runtime_kwargs.update(override_kwargs)

        model_instance = self._factory.create(
            model=model,
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

    user_provider_managers[user_id] = user_provider_manager

    return user_provider_manager
