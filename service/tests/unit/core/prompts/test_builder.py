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
from app.models.agent import Agent


@pytest.fixture
def mock_agent() -> Agent:
    agent = MagicMock(spec=Agent)
    agent.prompt = "Custom instructions here."
    agent.knowledge_set_id = "knowledge_base_123"
    return agent


@pytest.mark.asyncio
async def test_meta_instruction_block():
    block = MetaInstructionBlock()
    content = block.build()
    assert "You are Xyzen" in content
    assert "helpful, harmless, and honest" in content


@pytest.mark.asyncio
async def test_persona_block():
    block = PersonaBlock("Do this.")
    content = block.build()
    assert "Do this." in content

    block_empty = PersonaBlock(None)
    assert block_empty.build() == ""


@pytest.mark.asyncio
async def test_tool_instruction_block(mock_agent: Agent):
    block = ToolInstructionBlock(mock_agent)
    content = block.build()
    assert "<TOOL_USAGE_PROTOCOL>" in content
    assert "knowledge_base_123" in content

    mock_agent.knowledge_set_id = None
    block_empty = ToolInstructionBlock(mock_agent)
    assert block_empty.build() == ""


@pytest.mark.asyncio
async def test_context_block():
    block = ContextBlock()
    content = block.build()
    assert "<RUNTIME_CONTEXT>" in content
    assert "Current Date:" in content


@pytest.mark.asyncio
async def test_text_model_builder(mock_agent: Agent):
    builder = TextModelPromptBuilder()
    builder.construct_prompt(mock_agent, "gpt-4")
    result = builder.build()

    # Verify Layers Validation
    # 1. Meta
    assert "You are Xyzen" in result
    # 2. Context
    assert "Current Date:" in result
    # 3. Tool
    assert "knowledge_base_123" in result
    # 4. Persona
    assert "Custom instructions here." in result

    # Check Order (roughly)
    meta_idx = result.find("You are Xyzen")
    date_idx = result.find("Current Date:")

    assert meta_idx < date_idx
    # Tool/Persona order might vary based on implementation detail, but Meta/Context should be first


@pytest.mark.asyncio
async def test_image_model_builder(mock_agent: Agent):
    builder = ImageModelPromptBuilder()
    builder.construct_prompt(mock_agent, "dall-e-3")
    result = builder.build()

    # assert "You are Xyzen" in result
    assert "Custom instructions here." in result
    # Should NOT satisfy text model specifics if excluded (like format block for text?)
    # But FormatBlock returns empty for image models anyway.


@pytest.mark.asyncio
async def test_build_system_prompt_facade(mock_agent: Agent):
    db = MagicMock()

    # Text Model
    prompt = await build_system_prompt(db, mock_agent, "gpt-4")
    assert "You are Xyzen" in prompt
    assert "Custom instructions here." in prompt

    # Image Generation Model
    img_prompt = await build_system_prompt(db, mock_agent, "dall-e-3")
    # assert "You are Xyzen" in img_prompt
    assert "Custom instructions here." in img_prompt
