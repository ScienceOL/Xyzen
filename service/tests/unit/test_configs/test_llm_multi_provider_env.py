from pytest import MonkeyPatch

from app.configs import AppConfig


def test_llm_providers_env_parse_delimiter(monkeypatch: MonkeyPatch) -> None:
    # Ensure comma-separated env var is accepted (not JSON).
    monkeypatch.setenv("XYZEN_LLM_PROVIDERS", "azure_openai,google_vertex")

    # Provide minimal required per-provider fields to be considered enabled.
    monkeypatch.setenv("XYZEN_LLM_AZUREOPENAI_KEY", "test-key")
    monkeypatch.setenv("XYZEN_LLM_AZUREOPENAI_ENDPOINT", "https://example.azure.com/")
    monkeypatch.setenv("XYZEN_LLM_AZUREOPENAI_DEPLOYMENT", "gpt-5")

    # Vertex requires project; key is base64-encoded JSON for service account.
    monkeypatch.setenv("XYZEN_LLM_GOOGLEVERTEX_KEY", "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=")
    monkeypatch.setenv("XYZEN_LLM_GOOGLEVERTEX_PROJECT", "test-project")
    monkeypatch.setenv("XYZEN_LLM_GOOGLEVERTEX_DEPLOYMENT", "gemini-3-pro-preview")

    cfg = AppConfig()

    enabled = cfg.LLM.iter_enabled()
    assert [p.value for p, _ in enabled] == ["azure_openai", "google_vertex"]
    assert cfg.LLM.default_provider is not None
    assert cfg.LLM.default_provider.value == "azure_openai"
