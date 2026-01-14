"""Tests for graph_builder_v2 module."""

import pytest
from unittest.mock import AsyncMock

from pydantic import BaseModel

from app.agents.graph_builder_v2 import GraphBuilderV2, build_state_class_v2
from app.schemas.graph_config_v2 import (
    GraphConfig,
    GraphNodeConfig,
    GraphEdgeConfig,
    LLMNodeConfig,
    NodeType,
    StateFieldSchema,
    create_react_config,
)


class TestBuildStateClassV2:
    """Test build_state_class_v2 function."""

    def test_creates_pydantic_model(self) -> None:
        """Test that function creates a Pydantic model."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class_v2(config)
        assert issubclass(state_class, BaseModel)

    def test_has_messages_field(self) -> None:
        """Test state class has messages field."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class_v2(config)
        assert "messages" in state_class.model_fields

    def test_has_execution_context_field(self) -> None:
        """Test state class has execution_context field."""
        config = GraphConfig(nodes=[], edges=[])
        state_class = build_state_class_v2(config)
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
        state_class = build_state_class_v2(config)
        assert "counter" in state_class.model_fields


class TestGraphBuilderV2Init:
    """Test GraphBuilderV2 initialization."""

    def test_init_with_valid_config(self) -> None:
        """Test initialization with valid config."""
        config = create_react_config("Test")
        llm_factory = AsyncMock()
        builder = GraphBuilderV2(
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
            GraphBuilderV2(
                config=config,
                llm_factory=llm_factory,
                tool_registry={},
            )


class TestGraphBuilderV2Build:
    """Test GraphBuilderV2.build method."""

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
        builder = GraphBuilderV2(
            config=config,
            llm_factory=llm_factory,
            tool_registry={},
        )
        graph = builder.build()
        assert graph is not None
