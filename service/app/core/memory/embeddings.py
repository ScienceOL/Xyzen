"""Embedding factory for the memory system.

Creates LangChain Embeddings instances by reading the embedding config
and resolving credentials from the LLM provider config (env vars).
"""

from __future__ import annotations

import logging

from langchain_core.embeddings import Embeddings

from app.configs import configs
from app.configs.memory import EmbeddingConfig
from app.schemas.provider import LLMCredentials, ProviderType

logger = logging.getLogger(__name__)

# Maps config provider strings to ProviderType enum values
_PROVIDER_ALIASES: dict[str, ProviderType] = {
    "openai": ProviderType.OPENAI,
    "azure_openai": ProviderType.AZURE_OPENAI,
    "azureopenai": ProviderType.AZURE_OPENAI,
    "gpugeek": ProviderType.GPUGEEK,
    "qwen": ProviderType.QWEN,
    "google": ProviderType.GOOGLE,
    "google_vertex": ProviderType.GOOGLE_VERTEX,
    "googlevertex": ProviderType.GOOGLE_VERTEX,
}


def create_embeddings(embedding_config: EmbeddingConfig) -> Embeddings | None:
    """Create an Embeddings instance from config, or None if not configured.

    Reads credentials from configs.LLM.<provider> (env vars), avoiding
    the need for a DB session at startup time.
    """
    provider_str = embedding_config.Provider.strip().lower()
    if not provider_str:
        logger.info("No embedding provider configured, semantic search disabled")
        return None

    provider_type = _PROVIDER_ALIASES.get(provider_str)
    if provider_type is None:
        logger.warning("Unknown embedding provider '%s', semantic search disabled", embedding_config.Provider)
        return None

    # Read credentials from env-based LLM config
    provider_config = configs.LLM.get_provider_config(provider_type)
    api_key = provider_config.key.get_secret_value()
    if not api_key:
        logger.warning(
            "No API key for embedding provider '%s' (XYZEN_LLM_%s_KEY), semantic search disabled",
            provider_type.value,
            provider_str.upper().replace("_", ""),
        )
        return None

    from pydantic import SecretStr

    credentials: LLMCredentials = {"api_key": SecretStr(api_key)}
    if provider_config.api:
        credentials["api_endpoint"] = provider_config.api

    # Add provider-specific extra data (azure_endpoint, etc.)
    extra = provider_config.to_extra_data(provider_type)
    for k, v in extra.items():
        credentials[k] = v

    from app.core.providers.factory import ChatModelFactory

    try:
        embeddings = ChatModelFactory().create_embedding(
            model=embedding_config.Model,
            provider=provider_type,
            credentials=credentials,
        )
        logger.info(
            "Created embeddings: provider=%s, model=%s, dims=%d",
            provider_type.value,
            embedding_config.Model,
            embedding_config.Dims,
        )
        return embeddings
    except Exception:
        logger.exception("Failed to create embeddings, semantic search disabled")
        return None
