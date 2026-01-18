"""Tests for graph_config_v2 schema and migration functions."""

from app.schemas.graph_config import (
    ConditionOperator,
    ConditionType,
    CustomCondition,
    GraphConfig,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMNodeConfig,
    NodeType,
    ReducerType,
    StateFieldSchema,
    ToolNodeConfig,
    create_react_config,
    migrate_graph_config,
    migrate_v1_to_v2,
    validate_graph_config,
)


class TestNodeType:
    """Test NodeType enum."""

    def test_node_types_exist(self) -> None:
        """Test all expected node types exist."""
        assert NodeType.LLM.value == "llm"
        assert NodeType.TOOL.value == "tool"
        assert NodeType.TRANSFORM.value == "transform"


class TestConditionType:
    """Test ConditionType enum."""

    def test_condition_types_exist(self) -> None:
        """Test condition types for tool routing."""
        assert ConditionType.HAS_TOOL_CALLS.value == "has_tool_calls"
        assert ConditionType.NO_TOOL_CALLS.value == "no_tool_calls"


class TestReducerType:
    """Test ReducerType enum."""

    def test_reducer_types_exist(self) -> None:
        """Test reducer types."""
        assert ReducerType.REPLACE.value == "replace"
        assert ReducerType.ADD_MESSAGES.value == "add_messages"


class TestStateFieldSchema:
    """Test StateFieldSchema model."""

    def test_minimal_field(self) -> None:
        """Test creating field with minimal config."""
        field = StateFieldSchema(type="string")
        assert field.type == "string"
        assert field.reducer == ReducerType.REPLACE

    def test_field_with_reducer(self) -> None:
        """Test field with custom reducer."""
        field = StateFieldSchema(type="list", reducer=ReducerType.ADD_MESSAGES)
        assert field.reducer == ReducerType.ADD_MESSAGES


class TestLLMNodeConfig:
    """Test LLMNodeConfig model."""

    def test_minimal_config(self) -> None:
        """Test LLM config with minimal fields."""
        config = LLMNodeConfig(prompt_template="Hello")
        assert config.prompt_template == "Hello"
        assert config.output_key == "response"
        assert config.tools_enabled is True

    def test_full_config(self) -> None:
        """Test LLM config with all fields."""
        config = LLMNodeConfig(
            prompt_template="Test prompt",
            output_key="result",
            model_override="gpt-4",
            temperature_override=0.7,
            tools_enabled=False,
            max_iterations=5,
        )
        assert config.model_override == "gpt-4"
        assert config.temperature_override == 0.7
        assert config.tools_enabled is False
        assert config.max_iterations == 5


class TestToolNodeConfig:
    """Test ToolNodeConfig model."""

    def test_execute_all_config(self) -> None:
        """Test tool config with execute_all."""
        config = ToolNodeConfig(execute_all=True)
        assert config.execute_all is True
        assert config.output_key == "tool_results"

    def test_filtered_tools_config(self) -> None:
        """Test tool config with specific tools."""
        config = ToolNodeConfig(
            execute_all=False,
            tool_filter=["search", "calculator"],
        )
        assert config.execute_all is False
        assert config.tool_filter == ["search", "calculator"]


class TestGraphNodeConfig:
    """Test GraphNodeConfig model."""

    def test_llm_node(self) -> None:
        """Test creating an LLM node."""
        node = GraphNodeConfig(
            id="agent",
            name="Agent",
            type=NodeType.LLM,
            llm_config=LLMNodeConfig(prompt_template="Hello"),
        )
        assert node.id == "agent"
        assert node.type == NodeType.LLM
        assert node.llm_config is not None

    def test_tool_node(self) -> None:
        """Test creating a tool node."""
        node = GraphNodeConfig(
            id="tools",
            name="Tools",
            type=NodeType.TOOL,
            tool_config=ToolNodeConfig(execute_all=True),
        )
        assert node.type == NodeType.TOOL
        assert node.tool_config is not None


class TestGraphEdgeConfig:
    """Test GraphEdgeConfig model."""

    def test_simple_edge(self) -> None:
        """Test creating a simple edge."""
        edge = GraphEdgeConfig(from_node="START", to_node="agent")
        assert edge.from_node == "START"
        assert edge.to_node == "agent"
        assert edge.condition is None

    def test_conditional_edge_with_type(self) -> None:
        """Test edge with ConditionType."""
        edge = GraphEdgeConfig(
            from_node="agent",
            to_node="tools",
            condition=ConditionType.HAS_TOOL_CALLS,
        )
        assert edge.condition == ConditionType.HAS_TOOL_CALLS

    def test_conditional_edge_with_custom(self) -> None:
        """Test edge with CustomCondition."""
        edge = GraphEdgeConfig(
            from_node="router",
            to_node="end",
            condition=CustomCondition(
                state_key="done",
                operator=ConditionOperator.EQUALS,
                value=True,
                target="end",
            ),
        )
        assert isinstance(edge.condition, CustomCondition)


class TestGraphConfig:
    """Test GraphConfig model."""

    def test_minimal_config(self) -> None:
        """Test creating minimal graph config."""
        config = GraphConfig(
            nodes=[],
            edges=[],
        )
        assert config.version == "2.0"
        assert config.nodes == []
        assert config.edges == []

    def test_react_pattern_config(self) -> None:
        """Test creating a ReAct pattern config."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(prompt_template="Hello"),
                ),
                GraphNodeConfig(
                    id="tools",
                    name="Tools",
                    type=NodeType.TOOL,
                    tool_config=ToolNodeConfig(execute_all=True),
                ),
            ],
            edges=[
                GraphEdgeConfig(from_node="START", to_node="agent"),
                GraphEdgeConfig(
                    from_node="agent",
                    to_node="tools",
                    condition=ConditionType.HAS_TOOL_CALLS,
                ),
                GraphEdgeConfig(
                    from_node="agent",
                    to_node="END",
                    condition=ConditionType.NO_TOOL_CALLS,
                ),
                GraphEdgeConfig(from_node="tools", to_node="agent"),
            ],
            entry_point="agent",
        )
        assert len(config.nodes) == 2
        assert len(config.edges) == 4
        assert config.entry_point == "agent"


class TestValidateGraphConfig:
    """Test validate_graph_config function."""

    def test_valid_config(self) -> None:
        """Test validation passes for valid config."""
        config = create_react_config("Test prompt")
        errors = validate_graph_config(config)
        assert errors == []

    def test_invalid_entry_point(self) -> None:
        """Test validation fails for invalid entry point."""
        config = GraphConfig(
            nodes=[
                GraphNodeConfig(
                    id="agent",
                    name="Agent",
                    type=NodeType.LLM,
                    llm_config=LLMNodeConfig(prompt_template="Hi"),
                ),
            ],
            edges=[],
            entry_point="nonexistent",
        )
        errors = validate_graph_config(config)
        assert len(errors) > 0
        assert "entry point" in errors[0].lower()


class TestCreateReactConfig:
    """Test create_react_config factory function."""

    def test_creates_valid_config(self) -> None:
        """Test factory creates valid ReAct config."""
        config = create_react_config("You are helpful.")
        assert config.version == "2.0"
        assert len(config.nodes) == 2
        assert len(config.edges) == 4

    def test_agent_node_has_prompt(self) -> None:
        """Test agent node has correct prompt."""
        config = create_react_config("Custom prompt")
        agent_node = next(n for n in config.nodes if n.id == "agent")
        assert agent_node.llm_config is not None
        assert agent_node.llm_config.prompt_template == "Custom prompt"

    def test_tool_node_executes_all(self) -> None:
        """Test tool node is configured to execute all."""
        config = create_react_config("Test")
        tool_node = next(n for n in config.nodes if n.id == "tools")
        assert tool_node.tool_config is not None
        assert tool_node.tool_config.execute_all is True


class TestMigrateV1ToV2:
    """Test migrate_v1_to_v2 function."""

    def test_migrate_empty_config_returns_react(self) -> None:
        """Test that empty v1 config returns default ReAct config."""
        v1_config = {
            "version": "1.0",
            "nodes": [],
            "edges": [],
            "entry_point": "agent",
        }
        v2_config = migrate_v1_to_v2(v1_config)
        assert v2_config.version == "2.0"
        # Should have ReAct pattern: agent + tools nodes
        assert len(v2_config.nodes) == 2
        assert v2_config.nodes[0].id == "agent"
        assert v2_config.nodes[1].id == "tools"
        # Should have 4 edges in ReAct pattern
        assert len(v2_config.edges) == 4

    def test_migrate_simple_v1_config(self) -> None:
        """Test migrating a simple v1 config."""
        v1_config = {
            "version": "1.0",
            "nodes": [
                {
                    "id": "agent",
                    "name": "Agent",
                    "type": "llm",
                    "llm_config": {
                        "prompt_template": "Hello",
                        "output_key": "response",
                    },
                },
            ],
            "edges": [
                {"from_node": "START", "to_node": "agent"},
            ],
            "entry_point": "agent",
        }
        v2_config = migrate_v1_to_v2(v1_config)
        assert v2_config.version == "2.0"
        assert len(v2_config.nodes) == 1

    def test_migrate_tool_node_with_all(self) -> None:
        """Test migrating tool node with __all__ to execute_all."""
        v1_config = {
            "version": "1.0",
            "nodes": [
                {
                    "id": "tools",
                    "name": "Tools",
                    "type": "tool",
                    "tool_config": {
                        "tool_name": "__all__",
                        "output_key": "result",
                    },
                },
            ],
            "edges": [],
        }
        v2_config = migrate_v1_to_v2(v1_config)
        tool_node = v2_config.nodes[0]
        assert tool_node.tool_config is not None
        assert tool_node.tool_config.execute_all is True


class TestMigrateGraphConfig:
    """Test migrate_graph_config function."""

    def test_v2_config_passes_through(self) -> None:
        """Test v2 config is returned as-is."""
        v2_dict = create_react_config("Test").model_dump()
        result = migrate_graph_config(v2_dict)
        assert result.version == "2.0"

    def test_v1_config_is_migrated(self) -> None:
        """Test v1 config is migrated to v2."""
        v1_config = {
            "version": "1.0",
            "nodes": [],
            "edges": [],
        }
        result = migrate_graph_config(v1_config)
        assert result.version == "2.0"
