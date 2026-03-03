"""Provider-level failover configuration.

Defines model ID mappings between providers that serve the same underlying models
(e.g., GPUGeek and Bedrock both host Anthropic Claude models).

Note: Currently a utility module — not imported by the main failover path which
uses tier candidates in model_tier.py + health-aware selection in model_selector.py.
These mappings are available for dynamic model ID translation when needed
(e.g., translating a user-selected GPUGeek model to its Bedrock equivalent).
"""

from app.schemas.provider import ProviderType

# Mapping from GPUGeek model IDs to Bedrock model IDs for the same Anthropic models.
GPUGEEK_TO_BEDROCK_MODEL: dict[str, str] = {
    "Vendor2/Claude-4.6-Opus": "us.anthropic.claude-opus-4-6-v1",
    "Vendor2/Claude-4.5-Sonnet": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "Vendor2/Claude-4.5-Opus": "us.anthropic.claude-opus-4-5-20251101-v1:0",
    "Vendor2/Claude-4-Sonnet": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "Vendor2/Claude-3.7-Sonnet": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
}

BEDROCK_TO_GPUGEEK_MODEL: dict[str, str] = {v: k for k, v in GPUGEEK_TO_BEDROCK_MODEL.items()}

# Providers that serve the same model family and can fail over to each other.
ANTHROPIC_FAILOVER_PROVIDERS: list[ProviderType] = [
    ProviderType.GPUGEEK,
    ProviderType.BEDROCK,
]


def get_failover_model_id(model: str, target_provider: ProviderType) -> str | None:
    """Translate a model ID to the equivalent for a different provider.

    Returns None if no mapping exists (failover not possible for this model).
    """
    if target_provider == ProviderType.BEDROCK:
        return GPUGEEK_TO_BEDROCK_MODEL.get(model)
    if target_provider == ProviderType.GPUGEEK:
        return BEDROCK_TO_GPUGEEK_MODEL.get(model)
    return None
