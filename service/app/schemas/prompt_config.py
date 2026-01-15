"""
Pydantic schemas for prompt configuration.

The PromptConfig schema defines JSON-configurable prompt settings that can be
stored in an Agent's graph_config field. This enables:
- Product branding (hide real LLM provider)
- Security features (injection defense)
- Content safety guidelines
- Custom formatting and context injection
"""

from pydantic import BaseModel, Field


class IdentityConfig(BaseModel):
    """Agent identity configuration."""

    name: str = "Xyzen"
    description: str = "an advanced AI assistant designed to be helpful, harmless, and honest"
    persona: str | None = None


class BrandingConfig(BaseModel):
    """Product branding and provider masking configuration."""

    mask_provider: bool = True
    mask_model: bool = True
    branded_name: str = "Xyzen"
    forbidden_reveals: list[str] = Field(
        default_factory=lambda: [
            "OpenAI",
            "Anthropic",
            "Claude",
            "GPT",
            "GPT-4",
            "GPT-3",
            "Gemini",
            "Google",
            "DeepSeek",
            "Mistral",
            "Llama",
            "Meta",
        ]
    )


class SecurityConfig(BaseModel):
    """Security and prompt injection defense configuration."""

    injection_defense: bool = True
    refuse_prompt_reveal: bool = True
    refuse_instruction_override: bool = True
    confidential_sections: list[str] = Field(default_factory=lambda: ["system_instructions", "custom_instructions"])


class SafetyConfig(BaseModel):
    """Content safety guidelines configuration."""

    content_safety: bool = True
    refuse_illegal: bool = True
    refuse_harmful: bool = True
    refuse_explicit: bool = True
    refuse_violence: bool = True
    refuse_hate: bool = True
    refuse_self_harm: bool = True


class FormattingConfig(BaseModel):
    """Output formatting preferences."""

    use_markdown: bool = True
    code_blocks: bool = True
    language_identifiers: bool = True
    custom_blocks: list[str] = Field(default_factory=lambda: ["echart", "html"])


class ContextConfig(BaseModel):
    """Runtime context injection settings."""

    include_date: bool = True
    include_time: bool = False
    date_format: str = "%Y-%m-%d (%A)"
    custom_context: str | None = None


class OverridesConfig(BaseModel):
    """Full text overrides for specific prompt blocks.

    When set, these completely replace the corresponding auto-generated block.
    """

    meta_instruction: str | None = None
    persona_instruction: str | None = None
    tool_instruction: str | None = None
    format_instruction: str | None = None


class PromptConfig(BaseModel):
    """
    Complete prompt configuration schema.

    This configuration can be stored in Agent.graph_config["prompt_config"]
    and controls how the system prompt is generated.

    Example:
        {
            "prompt_config": {
                "version": "1.0",
                "identity": {
                    "name": "Xyzen Research",
                    "description": "a specialized research assistant"
                },
                "branding": {
                    "mask_provider": true
                },
                "custom_instructions": "Focus on academic sources."
            }
        }
    """

    version: str = "1.0"
    identity: IdentityConfig = Field(default_factory=IdentityConfig)
    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)
    formatting: FormattingConfig = Field(default_factory=FormattingConfig)
    context: ContextConfig = Field(default_factory=ContextConfig)
    custom_instructions: str | None = None
    overrides: OverridesConfig = Field(default_factory=OverridesConfig)


__all__ = [
    "IdentityConfig",
    "BrandingConfig",
    "SecurityConfig",
    "SafetyConfig",
    "FormattingConfig",
    "ContextConfig",
    "OverridesConfig",
    "PromptConfig",
]
