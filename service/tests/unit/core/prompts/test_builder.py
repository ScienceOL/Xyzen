"""
Unit tests for the prompt builder system.
"""

from unittest.mock import MagicMock

import pytest

from app.core.prompts.blocks import (
    ContextBlock,
    MetaInstructionBlock,
    PersonaBlock,
    ToolInstructionBlock,
)
from app.core.prompts.builder import ImageModelPromptBuilder, TextModelPromptBuilder, build_system_prompt
from app.core.prompts.defaults import DEFAULT_PROMPT_CONFIG, get_prompt_config_from_graph_config
from app.models.agent import Agent
from app.schemas.prompt_config import PromptConfig


@pytest.fixture
def mock_agent() -> Agent:
    agent = MagicMock(spec=Agent)
    agent.prompt = "Custom instructions here."
    agent.knowledge_set_id = "knowledge_base_123"
    agent.graph_config = None
    return agent


@pytest.fixture
def default_config() -> PromptConfig:
    return DEFAULT_PROMPT_CONFIG


@pytest.fixture
def custom_config() -> PromptConfig:
    return PromptConfig(custom_instructions="Custom instructions here.")


@pytest.mark.asyncio
async def test_meta_instruction_block(default_config: PromptConfig):
    block = MetaInstructionBlock(default_config)
    content = block.build()
    assert "You are Xyzen" in content
    assert "helpful, harmless, and honest" in content
    # Check identity protection is enabled
    assert "<IDENTITY_INTEGRITY>" in content
    assert "OpenAI" in content  # Should mention forbidden providers
    # Check instruction protection is enabled
    assert "<INSTRUCTION_PROTECTION>" in content
    # Check content safety is enabled
    assert "<CONTENT_SAFETY>" in content


@pytest.mark.asyncio
async def test_meta_instruction_block_with_branding_disabled():
    from app.schemas.prompt_config import BrandingConfig, SafetyConfig, SecurityConfig

    config = PromptConfig(
        branding=BrandingConfig(mask_provider=False),
        security=SecurityConfig(injection_defense=False),
        safety=SafetyConfig(content_safety=False),
    )
    block = MetaInstructionBlock(config)
    content = block.build()
    assert "You are Xyzen" in content
    # No identity protection
    assert "<IDENTITY_INTEGRITY>" not in content
    # No instruction protection
    assert "<INSTRUCTION_PROTECTION>" not in content
    # No content safety
    assert "<CONTENT_SAFETY>" not in content


@pytest.mark.asyncio
async def test_persona_block(custom_config: PromptConfig):
    block = PersonaBlock(custom_config)
    content = block.build()
    assert "Custom instructions here." in content
    assert "<CUSTOM_INSTRUCTIONS>" in content

    # Empty persona
    empty_config = PromptConfig(custom_instructions=None)
    block_empty = PersonaBlock(empty_config)
    assert block_empty.build() == ""


@pytest.mark.asyncio
async def test_tool_instruction_block(mock_agent: Agent, default_config: PromptConfig):
    block = ToolInstructionBlock(default_config, mock_agent)
    content = block.build()
    assert "<TOOL_USAGE_PROTOCOL>" in content
    assert "knowledge_base_123" in content

    mock_agent.knowledge_set_id = None
    block_empty = ToolInstructionBlock(default_config, mock_agent)
    assert block_empty.build() == ""


@pytest.mark.asyncio
async def test_context_block(default_config: PromptConfig):
    block = ContextBlock(default_config)
    content = block.build()
    assert "<RUNTIME_CONTEXT>" in content
    assert "Current Date:" in content


@pytest.mark.asyncio
async def test_context_block_with_time():
    from app.schemas.prompt_config import ContextConfig

    config = PromptConfig(context=ContextConfig(include_date=True, include_time=True))
    block = ContextBlock(config)
    content = block.build()
    assert "Current Date:" in content
    assert "Current Time:" in content


@pytest.mark.asyncio
async def test_text_model_builder(mock_agent: Agent, custom_config: PromptConfig):
    builder = TextModelPromptBuilder(custom_config)
    builder.construct_prompt(mock_agent, "gpt-4")
    result = builder.build()

    # Verify Layers Validation
    # 1. Meta
    assert "You are Xyzen" in result
    # 2. Context
    assert "Current Date:" in result
    # 3. Tool - not included since mock_agent.knowledge_set_id is set in fixture
    assert "knowledge_base_123" in result
    # 4. Persona
    assert "Custom instructions here." in result

    # Check Order (roughly)
    meta_idx = result.find("You are Xyzen")
    date_idx = result.find("Current Date:")

    assert meta_idx < date_idx


@pytest.mark.asyncio
async def test_image_model_builder(mock_agent: Agent, custom_config: PromptConfig):
    builder = ImageModelPromptBuilder(custom_config)
    builder.construct_prompt(mock_agent, "dall-e-3")
    result = builder.build()

    # Image models only include persona/custom instructions
    assert "Custom instructions here." in result
    # Should NOT include other blocks
    assert "You are Xyzen" not in result


@pytest.mark.asyncio
async def test_build_system_prompt_facade(mock_agent: Agent):
    db = MagicMock()

    # Text Model - with backward compatibility (agent.prompt -> custom_instructions)
    prompt = await build_system_prompt(db, mock_agent, "gpt-4")
    assert "You are Xyzen" in prompt
    assert "Custom instructions here." in prompt

    # Image Generation Model
    img_prompt = await build_system_prompt(db, mock_agent, "dall-e-3")
    assert "Custom instructions here." in img_prompt


@pytest.mark.asyncio
async def test_build_system_prompt_with_graph_config():
    db = MagicMock()
    agent = MagicMock(spec=Agent)
    agent.prompt = None
    agent.knowledge_set_id = None
    agent.graph_config = {
        "prompt_config": {
            "identity": {
                "name": "CustomBot",
                "description": "a custom assistant",
            },
            "branding": {
                "mask_provider": True,
                "branded_name": "CustomBot",
            },
            "custom_instructions": "Be helpful and concise.",
        }
    }

    prompt = await build_system_prompt(db, agent, "gpt-4")
    assert "You are CustomBot" in prompt
    assert "a custom assistant" in prompt
    assert "Be helpful and concise." in prompt


@pytest.mark.asyncio
async def test_get_prompt_config_from_graph_config():
    # No graph_config
    config = get_prompt_config_from_graph_config(None)
    assert config.identity.name == "Xyzen"
    assert config.branding.mask_provider is True

    # Empty graph_config
    config = get_prompt_config_from_graph_config({})
    assert config.identity.name == "Xyzen"

    # With prompt_config
    config = get_prompt_config_from_graph_config(
        {
            "prompt_config": {
                "identity": {"name": "TestBot"},
            }
        }
    )
    assert config.identity.name == "TestBot"

    # Backward compatibility with agent.prompt
    config = get_prompt_config_from_graph_config(None, "Legacy prompt")
    assert config.custom_instructions == "Legacy prompt"


@pytest.mark.asyncio
async def test_identity_protection_in_prompt(default_config: PromptConfig):
    """Test that identity protection blocks mentions of real providers."""
    block = MetaInstructionBlock(default_config)
    content = block.build()

    # Verify the forbidden reveals list is included
    assert "OpenAI" in content
    assert "Anthropic" in content
    assert "Claude" in content
    assert "GPT" in content
    assert "Gemini" in content

    # Verify identity instructions are clear
    assert "Never claim to be" in content
    assert "underlying technology" in content


@pytest.mark.asyncio
async def test_instruction_protection_in_prompt(default_config: PromptConfig):
    """Test that instruction protection blocks prompt reveal attempts."""
    block = MetaInstructionBlock(default_config)
    content = block.build()

    assert "configuration private" in content
    assert "politely explain" in content
