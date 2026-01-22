"""Tests for graph_builder module."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from app.agents.graph_builder import GraphBuilder, build_state_class
from app.schemas.graph_config import (
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMNodeConfig,
    NodeType,
    StateFieldSchema,
    create_react_config,
)


class TestBuildStateClass:
    """Test build_state_class function."""

    def test_creates_pydantic_model(self) -> None:
        """Test that function creates a Pydantic model."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class(config)
        assert issubclass(state_class, BaseModel)

    def test_has_messages_field(self) -> None:
        """Test state class has messages field."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class(config)
        assert "messages" in state_class.model_fields

    def test_has_execution_context_field(self) -> None:
        """Test state class has execution_context field."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class(config)
        assert "execution_context" in state_class.model_fields

    def test_custom_state_fields(self) -> None:
        """Test custom state fields are added."""
        config = GraphConfig(
            nodes=[],
            edges=[],
            custom_state_fields={
                "counter": StateFieldSchema(type="int"),
            },
        )
        state_class = build_state_class(config)
        assert "counter" in state_class.model_fields


class TestGraphBuilderInit:
    """Test GraphBuilder initialization."""

    def test_init_with_valid_config(self) -> None:
        """Test initialization with valid config."""
        config = create_react_config("Test")
        llm_factory = AsyncMock()
        builder = GraphBuilder(
            config=config,
            llm_factory=llm_factory,
            tool_registry={},
        )
        assert builder.config == config

    def test_init_validates_config(self) -> None:
        """Test initialization validates config."""
        config = GraphConfig(
            nodes=[],
            edges=[],
            entry_point="nonexistent",
        )
        llm_factory = AsyncMock()
        with pytest.raises(ValueError):
            GraphBuilder(
                config=config,
                llm_factory=llm_factory,
                tool_registry={},
            )


class TestGraphBuilderBuild:
    """Test GraphBuilder.build method."""

    def test_build_simple_graph(self) -> None:
        """Test build with a simple LLM-only graph."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(
                        prompt_template="Hello",
                        tools_enabled=False,
                    ),
                ),
            ],
            edges=[
                GraphEdgeConfig(from_node="START", to_node="agent"),
                GraphEdgeConfig(from_node="agent", to_node="END"),
            ],
            entry_point="agent",
        )
        llm_factory = AsyncMock()
        builder = GraphBuilder(
            config=config,
            llm_factory=llm_factory,
            tool_registry={},
        )
        graph = builder.build()
        assert graph is not None


class TestPromptTemplateAsSystemMessage:
    """Test that prompt_template is prepended as SystemMessage."""

    @pytest.mark.asyncio
    async def test_prompt_template_prepends_system_message(self) -> None:
        """Test prompt_template is prepended as SystemMessage, not appended as HumanMessage."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(
                        prompt_template="You are a helpful assistant.",
                        tools_enabled=False,
                    ),
                ),
            ],
            edges=[
                GraphEdgeConfig(from_node="START", to_node="agent"),
                GraphEdgeConfig(from_node="agent", to_node="END"),
            ],
            entry_point="agent",
        )

        # Create mock LLM that captures the messages it receives
        captured_messages: list[BaseMessage] = []

        async def mock_llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
            mock_llm = MagicMock()

            async def capture_invoke(messages: list[BaseMessage]) -> AIMessage:
                captured_messages.clear()
                captured_messages.extend(messages)
                return AIMessage(content="Response")

            mock_llm.ainvoke = capture_invoke
            return mock_llm

        builder = GraphBuilder(
            config=config,
            llm_factory=mock_llm_factory,
            tool_registry={},
        )
        graph = await builder.build()

        # Invoke with a user message
        initial_state: dict[str, list[BaseMessage]] = {
            "messages": [HumanMessage(content="Hello")],
        }
        await graph.ainvoke(initial_state)  # type: ignore[arg-type]  # type: ignore[arg-type]

        # Verify SystemMessage is first, not HumanMessage at the end
        assert len(captured_messages) >= 2
        assert isinstance(captured_messages[0], SystemMessage)
        assert captured_messages[0].content == "You are a helpful assistant."
        assert isinstance(captured_messages[1], HumanMessage)
        assert captured_messages[1].content == "Hello"

    @pytest.mark.asyncio
    async def test_no_prompt_template_passes_messages_unchanged(self) -> None:
        """Test that empty prompt_template doesn't add any system message."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(
                        prompt_template="",  # Empty
                        tools_enabled=False,
                    ),
                ),
            ],
            edges=[
                GraphEdgeConfig(from_node="START", to_node="agent"),
                GraphEdgeConfig(from_node="agent", to_node="END"),
            ],
            entry_point="agent",
        )

        captured_messages: list[BaseMessage] = []

        async def mock_llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
            mock_llm = MagicMock()

            async def capture_invoke(messages: list[BaseMessage]) -> AIMessage:
                captured_messages.clear()
                captured_messages.extend(messages)
                return AIMessage(content="Response")

            mock_llm.ainvoke = capture_invoke
            return mock_llm

        builder = GraphBuilder(
            config=config,
            llm_factory=mock_llm_factory,
            tool_registry={},
        )
        graph = await builder.build()

        initial_state: dict[str, list[BaseMessage]] = {
            "messages": [HumanMessage(content="Hello")],
        }
        await graph.ainvoke(initial_state)  # type: ignore[arg-type]

        # Should only have the original HumanMessage
        assert len(captured_messages) == 1
        assert isinstance(captured_messages[0], HumanMessage)
        assert captured_messages[0].content == "Hello"

    @pytest.mark.asyncio
    async def test_existing_system_message_replaced(self) -> None:
        """Test that existing SystemMessage in messages is replaced."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(
                        prompt_template="New system prompt",
                        tools_enabled=False,
                    ),
                ),
            ],
            edges=[
                GraphEdgeConfig(from_node="START", to_node="agent"),
                GraphEdgeConfig(from_node="agent", to_node="END"),
            ],
            entry_point="agent",
        )

        captured_messages: list[BaseMessage] = []

        async def mock_llm_factory(model: str | None = None, temperature: float | None = None) -> Any:
            mock_llm = MagicMock()

            async def capture_invoke(messages: list[BaseMessage]) -> AIMessage:
                captured_messages.clear()
                captured_messages.extend(messages)
                return AIMessage(content="Response")

            mock_llm.ainvoke = capture_invoke
            return mock_llm

        builder = GraphBuilder(
            config=config,
            llm_factory=mock_llm_factory,
            tool_registry={},
        )
        graph = await builder.build()

        # Input with existing SystemMessage
        initial_state: dict[str, list[BaseMessage]] = {
            "messages": [
                SystemMessage(content="Old system prompt"),
                HumanMessage(content="Hello"),
            ],
        }
        await graph.ainvoke(initial_state)  # type: ignore[arg-type]

        # Should have new SystemMessage first, no duplicates
        system_messages = [m for m in captured_messages if isinstance(m, SystemMessage)]
        assert len(system_messages) == 1
        assert system_messages[0].content == "New system prompt"
        assert isinstance(captured_messages[0], SystemMessage)
        assert isinstance(captured_messages[1], HumanMessage)
