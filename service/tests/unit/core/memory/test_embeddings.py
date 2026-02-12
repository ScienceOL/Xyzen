"""Unit tests for create_embeddings() factory."""

from unittest.mock import MagicMock, patch

import pytest

from app.configs.memory import EmbeddingConfig
from app.core.memory.embeddings import _PROVIDER_ALIASES, create_embeddings
from app.schemas.provider import ProviderType


class TestCreateEmbeddings:
    def _make_provider_config(self, api_key: str = "test-key", api: str = ""):
        """Create a mock provider config."""
        config = MagicMock()
        config.key.get_secret_value.return_value = api_key
        config.api = api
        config.to_extra_data.return_value = {}
        return config

    def test_empty_provider_returns_none(self) -> None:
        config = EmbeddingConfig(Provider="", Model="test-model", Dims=768)
        result = create_embeddings(config)
        assert result is None

    def test_whitespace_provider_returns_none(self) -> None:
        config = EmbeddingConfig(Provider="   ", Model="test-model", Dims=768)
        result = create_embeddings(config)
        assert result is None

    def test_unknown_provider_returns_none(self) -> None:
        config = EmbeddingConfig(Provider="nonexistent_provider", Model="test-model", Dims=768)
        result = create_embeddings(config)
        assert result is None

    @pytest.mark.parametrize(
        ("alias", "expected_type"),
        [
            ("openai", ProviderType.OPENAI),
            ("azure_openai", ProviderType.AZURE_OPENAI),
            ("azureopenai", ProviderType.AZURE_OPENAI),
            ("gpugeek", ProviderType.GPUGEEK),
            ("qwen", ProviderType.QWEN),
            ("google", ProviderType.GOOGLE),
            ("google_vertex", ProviderType.GOOGLE_VERTEX),
            ("googlevertex", ProviderType.GOOGLE_VERTEX),
        ],
    )
    def test_provider_alias_resolution(self, alias: str, expected_type: ProviderType) -> None:
        assert _PROVIDER_ALIASES[alias] == expected_type

    @patch("app.core.memory.embeddings.configs")
    def test_no_api_key_returns_none(self, mock_configs: MagicMock) -> None:
        mock_configs.LLM.get_provider_config.return_value = self._make_provider_config(api_key="")
        config = EmbeddingConfig(Provider="openai", Model="text-embedding-3-small", Dims=1536)

        result = create_embeddings(config)
        assert result is None

    @patch("app.core.memory.embeddings.configs")
    def test_successful_creation(self, mock_configs: MagicMock) -> None:
        mock_configs.LLM.get_provider_config.return_value = self._make_provider_config()
        mock_embeddings = MagicMock()

        config = EmbeddingConfig(Provider="openai", Model="text-embedding-3-small", Dims=1536)

        with patch("app.core.providers.factory.ChatModelFactory") as MockFactory:
            MockFactory.return_value.create_embedding.return_value = mock_embeddings
            result = create_embeddings(config)

        assert result is mock_embeddings

    @patch("app.core.memory.embeddings.configs")
    def test_factory_exception_returns_none(self, mock_configs: MagicMock) -> None:
        mock_configs.LLM.get_provider_config.return_value = self._make_provider_config()
        config = EmbeddingConfig(Provider="openai", Model="text-embedding-3-small", Dims=1536)

        with patch("app.core.providers.factory.ChatModelFactory") as MockFactory:
            MockFactory.return_value.create_embedding.side_effect = RuntimeError("connection failed")
            result = create_embeddings(config)

        assert result is None

    @patch("app.core.memory.embeddings.configs")
    def test_extra_data_forwarded_to_credentials(self, mock_configs: MagicMock) -> None:
        provider_config = self._make_provider_config(api_key="test-key", api="https://custom.api")
        provider_config.to_extra_data.return_value = {"azure_endpoint": "https://azure.endpoint"}
        mock_configs.LLM.get_provider_config.return_value = provider_config

        config = EmbeddingConfig(Provider="azure_openai", Model="text-embedding-ada-002", Dims=1536)

        with patch("app.core.providers.factory.ChatModelFactory") as MockFactory:
            MockFactory.return_value.create_embedding.return_value = MagicMock()
            create_embeddings(config)

            call_kwargs = MockFactory.return_value.create_embedding.call_args
            credentials = call_kwargs.kwargs.get("credentials") or call_kwargs[1].get("credentials")
            assert credentials["azure_endpoint"] == "https://azure.endpoint"
            assert credentials["api_endpoint"] == "https://custom.api"
