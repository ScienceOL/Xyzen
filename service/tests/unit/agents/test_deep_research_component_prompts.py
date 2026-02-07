"""Tests for deep-research component prompt layering."""

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from app.agents.components.deep_research.components import ResearchBriefComponent


@pytest.mark.asyncio
async def test_research_brief_component_includes_system_prompt_layer() -> None:
    component = ResearchBriefComponent()
    captured_messages: list[BaseMessage] = []

    async def llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
        _ = (model, temperature)
        mock_llm = MagicMock()

        async def ainvoke(messages: list[BaseMessage]) -> AIMessage:
            captured_messages.clear()
            captured_messages.extend(messages)
            return AIMessage(content="brief")

        mock_llm.ainvoke = ainvoke
        return mock_llm

    graph = await component.build_graph(
        llm_factory=llm_factory,
        tools=[],
        config={"system_prompt": "PLATFORM_POLICY_PROMPT"},
    )
    await graph.ainvoke({"messages": [HumanMessage(content="What is new in quantum error correction?")]})

    assert captured_messages
    assert isinstance(captured_messages[0], HumanMessage)
    prompt_content = captured_messages[0].content
    assert isinstance(prompt_content, str)
    prompt_text = prompt_content
    assert "PLATFORM_POLICY_PROMPT" in prompt_text
