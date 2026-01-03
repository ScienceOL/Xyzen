"""Unit tests for provider routing / fallback logic."""

from __future__ import annotations

from typing import Any

from _pytest.monkeypatch import MonkeyPatch
from pydantic import SecretStr

from app.core.providers.factory import ChatModelFactory
from app.core.providers.manager import ProviderManager
from app.schemas.provider import LLMCredentials, ProviderScope, ProviderType


class TestProviderRouting:
    def test_system_fallback_routes_gpt_models_to_azure_openai(self, monkeypatch: MonkeyPatch) -> None:
        """When provider_id is missing, gpt-* should not accidentally route to Vertex."""

        # Avoid calling LiteLLM/network in unit test.
        def _fake_get_model_info(_model: str) -> dict[str, str]:
            return {"litellm_provider": "openai"}

        monkeypatch.setattr(
            "app.core.providers.manager.LiteLLMService.get_model_info",
            _fake_get_model_info,
        )

        manager = ProviderManager()

        # Register the system aliases that routing expects.
        manager.add_provider(
            name="system:azure_openai",
            provider_scope=ProviderScope.SYSTEM,
            provider_type=ProviderType.AZURE_OPENAI,
            api_key=SecretStr("k"),
            api_endpoint="https://azure.example.com",
            model="gpt-5-mini",
            extra_config={"azure_endpoint": "https://azure.example.com", "azure_deployment": "gpt-5"},
        )
        manager.add_provider(
            name="system:google_vertex",
            provider_scope=ProviderScope.SYSTEM,
            provider_type=ProviderType.GOOGLE_VERTEX,
            api_key=SecretStr("k"),
            api_endpoint="https://vertex.example.com",
            model="gemini-2.5-flash",
            extra_config={"vertex_project": "p", "vertex_sa": {"type": "service_account"}},
        )

        chosen: dict[str, ProviderType] = {}

        def fake_factory_create(
            self: ChatModelFactory,
            *,
            model: str,
            provider: ProviderType,
            credentials: LLMCredentials,
            **runtime_kwargs: Any,
        ) -> Any:
            chosen["provider"] = provider

            class _MI:
                llm = object()

            return _MI()

        monkeypatch.setattr(ChatModelFactory, "create", fake_factory_create, raising=True)

        manager.create_langchain_model(provider_id=None, model="gpt-5.2")
        assert chosen["provider"] == ProviderType.AZURE_OPENAI
