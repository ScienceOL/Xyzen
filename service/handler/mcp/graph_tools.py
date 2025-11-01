"""
MCP Server for Graph Agent Tools - Base Agent Operations

This module provides comprehensive tools for creating, managing, and executing graph-based agents.
Graph agents are composed of nodes (processing units) and edges (connections) that define
the flow of execution and data processing.

## Node Types Available:
- 'llm': Language model nodes for text generation and processing
- 'tool': Function/tool execution nodes for specific operations
- 'router': Decision-making nodes that route execution based on conditions
- 'subagent': Nested agent execution nodes
- 'start': Entry point nodes (required for each graph)
- 'end': Exit point nodes (required for each graph)

## Common Node Configurations:
- LLM nodes: {"model": "gpt-5", "system_prompt": "..."}
- Tool nodes: {"tool_name": "search", "parameters": {...}}
- Router nodes: {"conditions": [{"field": "intent", "value": "search", "target": "search_node"}]}
- Start/End nodes: {} (minimal config required)

## State Schema Guidelines:
The state schema defines the data structure that flows between nodes. Common patterns:
- Always include "messages" array for conversation history
- Include "current_step" for tracking execution flow
- Add domain-specific fields based on your use case
"""

import json
import logging
from typing import Any
from uuid import UUID

from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import AccessToken, get_access_token

from core.chat.langgraph import execute_graph_agent_sync
from middleware.auth import AuthProvider
from middleware.auth import AuthProvider as InternalAuthProvider
from middleware.auth import UserInfo
from middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
from middleware.database.connection import AsyncSessionLocal
from models.graph import (
    GraphAgentCreate,
    GraphAgentUpdate,
    GraphEdgeCreate,
    GraphNodeCreate,
)
from repo.graph import GraphRepository

logger = logging.getLogger(__name__)

# MCP Server instance
mcp = FastMCP("graph-tools")

# 创建认证提供者 - 使用 TokenVerifier 类型但赋值给变量名 auth
# 这个变量会被 MCP 自动发现机制识别为 AuthProvider（因为 TokenVerifier 继承自 AuthProvider）
auth: TokenVerifier

match InternalAuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(
            public_key=InternalAuthProvider.public_key,
        )
    case "casdoor":
        auth = JWTVerifier(
            jwks_uri=InternalAuthProvider.jwks_uri,
        )
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=InternalAuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {InternalAuthProvider.get_provider_name()}")


def error_response(message: str) -> str:
    """Helper function to return consistent error responses"""
    return json.dumps(
        {
            "status": "error",
            "message": message,
        },
        indent=2,
    )


def get_current_user() -> UserInfo:
    """
    Dependency function to get the current user from the access token.
    """
    access_token: AccessToken | None = get_access_token()
    if not access_token:
        raise ValueError("Access token is required for this operation.")

    user_info = AuthProvider.parse_user_info(access_token.claims)
    if not user_info or not user_info.id:
        raise ValueError(f"Hello, unknown! Your scopes are: {', '.join(access_token.scopes)}")
    return user_info


async def get_node_id_by_name(repo: GraphRepository, agent_id: UUID, node_name: str) -> UUID:
    """Helper to get node ID by name within an agent"""
    nodes = await repo.get_nodes_by_agent(agent_id)
    for node in nodes:
        if node.name == node_name:
            return node.id
    raise ValueError(f"Node '{node_name}' not found in agent {agent_id}")


def get_node_config_template(node_type: str) -> dict[str, Any]:
    """Get a template configuration for a specific node type"""
    templates = {
        "llm": {
            "model": "gpt-5",
            "system_prompt": "You are a helpful assistant. Process the input and provide a response.",
        },
        "tool": {"tool_name": "example_tool", "parameters": {}, "timeout_seconds": 30},
        "router": {
            "conditions": [{"field": "intent", "operator": "equals", "value": "search", "target": "search_node"}],
            "default_target": "default_node",
        },
        "subagent": {"agent_id": "sub-agent-uuid", "input_mapping": {}, "output_mapping": {}},
        "start": {},
        "end": {"output_format": "json"},
    }
    return templates.get(node_type, {})


def success_response(message: str, data: dict[str, Any] | None = None) -> str:
    """Helper function to return consistent success responses"""
    response = {
        "status": "success",
        "message": message,
    }
    if data:
        response.update(data)
    return json.dumps(response, indent=2)


@mcp.tool
async def create_agent(
    name: str,
    description: str,
) -> str:
    """
    Create a new empty graph agent with a basic state schema.

    This creates an agent with minimal configuration that you can then build upon
    by adding nodes and edges. The agent starts with a default state schema that
    includes common fields like messages, current_step, user_input, etc.

    Args:
        name: Name of the graph agent (e.g., "Customer Support Bot", "Data Processor")
        description: Detailed description of what the agent does and its purpose
                    (e.g., "Handles customer inquiries and routes to appropriate departments")

    Returns:
        JSON string with:
        - status: "success" or "error"
        - message: Human-readable result message
        - agent_id: UUID of the created agent (use this for further operations)
        - name: Confirmed agent name
        - description: Confirmed agent description

    Example Usage:
        create_agent(
            name="Research Assistant",
            description="Helps users research topics by searching and summarizing information"
        )
    """
    user_info = get_current_user()

    try:
        if not name or not description:
            return error_response("Missing required fields: name, description")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Create agent with basic state schema
            agent_data = GraphAgentCreate(
                name=name,
                description=description,
                state_schema={
                    "type": "object",
                    "properties": {
                        "messages": {"type": "array"},
                        "current_step": {"type": "string"},
                        "user_input": {"type": "string"},
                        "final_output": {"type": "string"},
                        "execution_context": {"type": "object"},
                    },
                },
            )

            agent = await repo.create_graph_agent(agent_data, user_info.id)
            await session.commit()

            logger.info(f"Created graph agent: {agent.id}")
            return json.dumps(
                {
                    "status": "success",
                    "message": f"Graph agent '{name}' created successfully",
                    "agent_id": str(agent.id),
                    "name": name,
                    "description": description,
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to create agent: {e}")
        return error_response(f"Error creating agent: {str(e)}")


@mcp.tool
async def define_state(agent_id: str, state_schema: dict[str, Any]) -> str:
    """
    Define or update the state schema for a graph agent.

    The state schema defines the structure of data that flows between nodes in your
    graph agent. This is crucial for validation and ensuring nodes can properly
    communicate with each other.

    Args:
        agent_id: UUID of the graph agent to update
        state_schema: JSON Schema object defining the state structure.
                     Must include "type": "object" and "properties" field.

    Returns:
        JSON string with operation result

    Example Usage:
        define_state(
            agent_id="12345678-1234-1234-1234-123456789abc",
            state_schema={
                "type": "object",
                "properties": {
                    "messages": {"type": "array", "items": {"type": "object"}},
                    "current_step": {"type": "string"},
                    "user_query": {"type": "string"},
                    "search_results": {"type": "array"},
                    "final_answer": {"type": "string"},
                    "confidence_score": {"type": "number", "minimum": 0, "maximum": 1}
                },
                "required": ["messages", "current_step"]
            }
        )
    """
    user_info = get_current_user()

    try:
        if not agent_id or not state_schema:
            return error_response("Missing required fields: agent_id, state_schema")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Check agent exists and user has permission
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to modify this agent")

            update_data = GraphAgentUpdate(state_schema=state_schema)
            updated_agent = await repo.update_graph_agent(UUID(agent_id), update_data)

            if not updated_agent:
                return error_response(f"Failed to update agent {agent_id}")

            await session.commit()

            logger.info(f"Updated state schema for agent: {agent_id}")
            return json.dumps(
                {
                    "status": "success",
                    "message": f"Successfully updated state schema for agent {agent_id}",
                    "agent_id": agent_id,
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to define state: {e}")
        return error_response(f"Error defining state: {str(e)}")


@mcp.tool
async def add_node(
    agent_id: str,
    name: str,
    node_type: str,
    config: dict[str, Any],
    position_x: float | None = None,
    position_y: float | None = None,
) -> str:
    """
    Add a node to a graph agent.

    Nodes are the processing units in your graph agent. Each node type has specific
    configuration requirements and capabilities.

    Args:
        agent_id: UUID of the graph agent to add the node to
        name: Unique name for the node within the agent (used for connecting edges)
        node_type: Type of node - one of: 'llm', 'tool', 'router', 'subagent', 'start', 'end'
        config: Configuration dict specific to the node type (see examples below)
        position_x: X coordinate for visual layout (optional, for UI)
        position_y: Y coordinate for visual layout (optional, for UI)

    Returns:
        JSON string with node creation result and assigned node_id

    Node Type Configuration Examples:

    LLM Node:
        add_node(
            agent_id="...",
            name="analyzer",
            node_type="llm",
            config={
                "model": "gpt-5",
                "system_prompt": "You are an expert data analyst. Analyze the input and provide insights."
            }
        )

    LLM Node with Specific Provider:
        add_node(
            agent_id="...",
            name="analyzer",
            node_type="llm",
            config={
                "model": "gpt-5",
                "provider_name": "system",  # Use system provider
                "system_prompt": "You are an expert data analyst. Analyze the input and provide insights."
            }
        )

    Tool Node:
        add_node(
            agent_id="...",
            name="web_search",
            node_type="tool",
            config={
                "tool_name": "search_web",
                "parameters": {
                    "max_results": 5,
                    "include_snippets": True
                }
            }
        )

    Router Node:
        add_node(
            agent_id="...",
            name="intent_router",
            node_type="router",
            config={
                "conditions": [
                    {"field": "user_intent", "operator": "equals", "value": "search", "target": "search_node"},
                    {"field": "user_intent", "operator": "equals", "value": "summarize", "target": "summary_node"}
                ],
                "default_target": "help_node"
            }
        )

    Start Node:
        add_node(
            agent_id="...",
            name="start",
            node_type="start",
            config={}  # Minimal config for start nodes
        )

    End Node:
        add_node(
            agent_id="...",
            name="end",
            node_type="end",
            config={
                "output_format": "json",  # Optional: specify output formatting
                "cleanup_actions": ["save_logs"]  # Optional: cleanup tasks
            }
        )
    """
    user_info = get_current_user()

    try:
        if not agent_id or not name or not node_type:
            return error_response("Missing required fields: agent_id, name, node_type")

        # Validate node type
        valid_types = ["llm", "tool", "router", "subagent", "start", "end"]
        if node_type not in valid_types:
            return error_response(f"Invalid node type '{node_type}'. Valid types: {valid_types}")

        # Validate provider_name for LLM nodes
        if node_type == "llm" and config.get("provider_name"):
            from core.providers import get_user_provider_manager

            async with AsyncSessionLocal() as temp_session:
                try:
                    user_provider_manager = await get_user_provider_manager(user_info.id, temp_session)
                    provider = user_provider_manager.get_provider(config["provider_name"])
                    if not provider:
                        return error_response(
                            f"Provider '{config['provider_name']}' not found or not available to user"
                        )
                except Exception as e:
                    logger.warning(f"Could not validate provider '{config.get('provider_name')}': {e}")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Check agent exists and user has permission
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to modify this agent")

            node_data = GraphNodeCreate(
                name=name,
                node_type=node_type,
                config=config,
                graph_agent_id=UUID(agent_id),
                position_x=position_x,
                position_y=position_y,
            )

            node = await repo.create_node(node_data)
            await session.commit()

            logger.info(f"Added node '{name}' to agent {agent_id}")
            return json.dumps(
                {
                    "status": "success",
                    "message": f"Successfully added {node_type} node '{name}'",
                    "node_id": str(node.id),
                    "agent_id": agent_id,
                    "name": name,
                    "node_type": node_type,
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to add node: {e}")
        return error_response(f"Error adding node: {str(e)}")


@mcp.tool
async def add_edge(
    agent_id: str,
    from_node: str,
    to_node: str,
    condition: dict[str, Any] | None = None,
    label: str | None = None,
) -> str:
    """
    Add an edge between two nodes in a graph agent.

    Args:
        agent_id: ID of the graph agent
        from_node: Name of the source node
        to_node: Name of the target node
        condition: Optional condition for routing
        label: Optional label for the edge

    Returns:
        JSON string containing creation result
    """
    user_info = get_current_user()

    try:
        if not agent_id or not from_node or not to_node:
            return error_response("Missing required fields: agent_id, from_node, to_node")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Check agent exists and user has permission
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to modify this agent")

            agent_uuid = UUID(agent_id)

            # Get node IDs by names
            from_node_id = await get_node_id_by_name(repo, agent_uuid, from_node)
            to_node_id = await get_node_id_by_name(repo, agent_uuid, to_node)

            edge_data = GraphEdgeCreate(
                from_node_id=from_node_id,
                to_node_id=to_node_id,
                condition=condition,
                graph_agent_id=agent_uuid,
                label=label,
            )

            edge = await repo.create_edge(edge_data)
            await session.commit()

            logger.info(f"Added edge from '{from_node}' to '{to_node}' in agent {agent_id}")
            return json.dumps(
                {
                    "status": "success",
                    "message": f"Successfully added edge from '{from_node}' to '{to_node}'",
                    "edge_id": str(edge.id),
                    "agent_id": agent_id,
                    "from_node": from_node,
                    "to_node": to_node,
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to add edge: {e}")
        return error_response(f"Error adding edge: {str(e)}")


@mcp.tool
async def run_agent(agent_id: str, input_state: dict[str, Any]) -> str:
    """
    Execute a graph agent with the given input state.

    Args:
        agent_id: ID of the graph agent to execute
        input_state: Initial state for execution

    Returns:
        JSON string containing execution result
    """
    user_info = get_current_user()

    try:
        if not agent_id or not input_state:
            return error_response("Missing required fields: agent_id, input_state")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Check agent exists and user has permission
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to execute this agent")

            # Add user_id to input state for execution context
            enhanced_input_state = {
                **input_state,
                "execution_context": {**input_state.get("execution_context", {}), "user_id": user_info.id},
            }

            # Execute graph agent synchronously
            result = await execute_graph_agent_sync(session, UUID(agent_id), enhanced_input_state, user_info.id)

            if result.success:
                return json.dumps(
                    {
                        "status": "success",
                        "message": f"Agent executed successfully in {result.execution_time_ms}ms",
                        "agent_id": agent_id,
                        "final_state": result.final_state,
                        "execution_time_ms": result.execution_time_ms,
                    },
                    indent=2,
                )
            else:
                return json.dumps(
                    {
                        "status": "error",
                        "message": result.error_message or "Agent execution failed",
                        "agent_id": agent_id,
                        "execution_time_ms": result.execution_time_ms,
                    },
                    indent=2,
                )

    except Exception as e:
        logger.error(f"Failed to run agent: {e}")
        return error_response(f"Error running agent: {str(e)}")


@mcp.tool
async def list_agents() -> str:
    """
    List all graph agents for the current user.

    Returns:
        JSON string containing list of agents
    """
    user_info = get_current_user()

    try:
        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            agents = await repo.get_graph_agents_by_user(user_info.id)

            if not agents:
                return json.dumps(
                    {
                        "status": "success",
                        "message": "No graph agents found for current user",
                        "agents": [],
                        "count": 0,
                    },
                    indent=2,
                )

            agent_list = []
            for agent in agents:
                agent_info = {
                    "id": str(agent.id),
                    "name": agent.name,
                    "description": agent.description,
                    "is_active": agent.is_active,
                    "created_at": agent.created_at.isoformat(),
                    "updated_at": agent.updated_at.isoformat(),
                }
                agent_list.append(agent_info)

            return json.dumps(
                {
                    "status": "success",
                    "agents": agent_list,
                    "count": len(agents),
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to list agents: {e}")
        return error_response(f"Error listing agents: {str(e)}")


@mcp.tool
async def create_agent_with_graph(
    name: str,
    description: str,
    state_schema: dict[str, Any],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> str:
    """
    Create a complete graph agent with nodes and edges in a single operation.

    Args:
        name: Name of the graph agent
        description: Description of what the agent does
        state_schema: JSON schema definition for the agent state
        nodes: List of nodes to create
        edges: List of edges to create

    Returns:
        JSON string containing creation result
    """
    user_info = get_current_user()

    try:
        if not name or not description or not state_schema or not nodes:
            return error_response("Missing required fields: name, description, state_schema, nodes")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Create agent first
            agent_data = GraphAgentCreate(
                name=name,
                description=description,
                state_schema=state_schema,
            )
            agent = await repo.create_graph_agent(agent_data, user_info.id)

            # Create nodes and build name-to-ID mapping
            node_id_map = {}
            for node_data in nodes:
                node_create = GraphNodeCreate(
                    name=node_data["name"],
                    node_type=node_data["node_type"],
                    config=node_data.get("config", {}),
                    graph_agent_id=agent.id,
                    position_x=node_data.get("position_x"),
                    position_y=node_data.get("position_y"),
                )
                node = await repo.create_node(node_create)
                node_id_map[node.name] = node.id

            # Create edges with resolved node IDs
            edges_created = 0
            for edge_data in edges:
                from_name = edge_data["from_node"]
                to_name = edge_data["to_node"]

                if from_name not in node_id_map or to_name not in node_id_map:
                    logger.warning(f"Skipping edge from {from_name} to {to_name}: nodes not found")
                    continue

                edge_create = GraphEdgeCreate(
                    from_node_id=node_id_map[from_name],
                    to_node_id=node_id_map[to_name],
                    condition=edge_data.get("condition"),
                    graph_agent_id=agent.id,
                    label=edge_data.get("label"),
                )
                await repo.create_edge(edge_create)
                edges_created += 1

            await session.commit()

            logger.info(f"Created complete graph agent: {agent.id}")
            return json.dumps(
                {
                    "status": "success",
                    "message": (
                        f"Successfully created graph agent '{name}' with {len(nodes)} nodes "
                        f"and {edges_created} edges"
                    ),
                    "agent_id": str(agent.id),
                    "name": name,
                    "description": description,
                    "nodes_created": len(nodes),
                    "edges_created": edges_created,
                },
                indent=2,
            )

    except Exception as e:
        logger.error(f"Failed to create agent with graph: {e}")
        return error_response(f"Error creating agent with graph: {str(e)}")


@mcp.tool
async def inspect_agent(agent_id: str) -> str:
    """
    Get detailed information about a graph agent including its structure.

    This tool provides comprehensive information about an agent's configuration,
    nodes, edges, and overall structure for debugging and understanding purposes.

    Args:
        agent_id: UUID of the graph agent to inspect

    Returns:
        JSON string with complete agent details including:
        - Agent metadata (name, description, state schema)
        - List of all nodes with their configurations
        - List of all edges with their conditions
        - Graph statistics and validation info

    Example Usage:
        inspect_agent(agent_id="12345678-1234-1234-1234-123456789abc")
    """
    user_info = get_current_user()

    try:
        if not agent_id:
            return error_response("Missing required field: agent_id")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Get agent details
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to inspect this agent")

            # Get nodes and edges
            nodes = await repo.get_nodes_by_agent(UUID(agent_id))
            edges = await repo.get_edges_by_agent(UUID(agent_id))

            # Build node details
            node_details = []
            node_name_map = {}
            for node in nodes:
                node_info = {
                    "id": str(node.id),
                    "name": node.name,
                    "type": node.node_type,
                    "config": node.config,
                    "position": {"x": node.position_x, "y": node.position_y},
                }
                node_details.append(node_info)
                node_name_map[node.id] = node.name

            # Build edge details
            edge_details = []
            for edge in edges:
                edge_info = {
                    "id": str(edge.id),
                    "from_node": node_name_map.get(edge.from_node_id, "UNKNOWN"),
                    "to_node": node_name_map.get(edge.to_node_id, "UNKNOWN"),
                    "condition": edge.condition,
                    "label": edge.label,
                }
                edge_details.append(edge_info)

            # Graph statistics and validation
            node_types = {}
            for node in nodes:
                node_types[node.node_type] = node_types.get(node.node_type, 0) + 1

            has_start_node = any(node.node_type == "start" for node in nodes)
            has_end_node = any(node.node_type == "end" for node in nodes)

            graph_validation = {
                "has_start_node": has_start_node,
                "has_end_node": has_end_node,
                "is_complete": has_start_node and has_end_node,
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "node_type_counts": node_types,
            }

            return success_response(
                f"Agent '{agent.name}' inspection complete",
                {
                    "agent": {
                        "id": str(agent.id),
                        "name": agent.name,
                        "description": agent.description,
                        "state_schema": agent.state_schema,
                        "is_active": agent.is_active,
                        "created_at": agent.created_at.isoformat(),
                        "updated_at": agent.updated_at.isoformat(),
                    },
                    "nodes": node_details,
                    "edges": edge_details,
                    "graph_validation": graph_validation,
                },
            )

    except Exception as e:
        logger.error(f"Failed to inspect agent: {e}")
        return error_response(f"Error inspecting agent: {str(e)}")


@mcp.tool
async def get_node_template(node_type: str) -> str:
    """
    Get a configuration template for a specific node type.

    This tool provides ready-to-use configuration templates for each node type,
    which can be used as starting points when creating nodes.

    Args:
        node_type: Type of node ('llm', 'tool', 'router', 'subagent', 'start', 'end')

    Returns:
        JSON string with template configuration and usage guidance

    Example Usage:
        get_node_template(node_type="llm")
        get_node_template(node_type="router")
    """
    try:
        valid_types = ["llm", "tool", "router", "subagent", "start", "end"]
        if node_type not in valid_types:
            return error_response(f"Invalid node type '{node_type}'. Valid types: {valid_types}")

        template = get_node_config_template(node_type)

        return success_response(
            f"Configuration template for {node_type} node",
            {
                "node_type": node_type,
                "template": template,
                "usage_example": f"""add_node(
agent_id="your-agent-id",
name="your_node_name",
node_type="{node_type}",
config={json.dumps(template, indent=8)}
)""",
            },
        )

    except Exception as e:
        logger.error(f"Failed to get node template: {e}")
        return error_response(f"Error getting node template: {str(e)}")


@mcp.tool
async def list_user_providers() -> str:
    """
    List available AI providers for the current user.

    This tool shows all providers (both system and user-specific) that can be
    used in the provider_name field when creating LLM nodes.

    Returns:
        JSON string with list of available providers including:
        - Provider names that can be used in LLM node configurations
        - Provider types (OpenAI, Anthropic, etc.)
        - Whether each provider is currently active
        - Provider availability status

    Example Usage:
        list_user_providers()

    Use the returned provider names in LLM node configurations:
        config = {
            "model": "gpt-5",
            "provider_name": "system",  # Use a name from this list
            "system_prompt": "..."
        }
    """
    user_info = get_current_user()

    try:
        from core.providers import get_user_provider_manager

        async with AsyncSessionLocal() as session:
            user_provider_manager = await get_user_provider_manager(user_info.id, session)

            # Get list of providers
            providers_info = user_provider_manager.list_providers()

            return success_response(
                f"Found {len(providers_info)} available providers for user",
                {
                    "providers": providers_info,
                    "count": len(providers_info),
                    "usage_note": "Use the 'name' field values in LLM node 'provider_name' configuration",
                },
            )

    except Exception as e:
        logger.error(f"Failed to list user providers: {e}")
        return error_response(f"Error listing user providers: {str(e)}")


@mcp.tool
async def validate_agent_structure(agent_id: str) -> str:
    """
    Validate the structure and configuration of a graph agent.

    This tool performs comprehensive validation checks on an agent's structure,
    including node configurations, connectivity, and graph completeness.

    Args:
        agent_id: UUID of the graph agent to validate

    Returns:
        JSON string with validation results and recommendations

    Example Usage:
        validate_agent_structure(agent_id="12345678-1234-1234-1234-123456789abc")
    """
    user_info = get_current_user()

    try:
        if not agent_id:
            return error_response("Missing required field: agent_id")

        async with AsyncSessionLocal() as session:
            repo = GraphRepository(session)

            # Get agent and check permissions
            agent = await repo.get_graph_agent_by_id(UUID(agent_id))
            if not agent:
                return error_response(f"Agent {agent_id} not found")

            if agent.user_id != user_info.id:
                return error_response("Permission denied: You don't have permission to validate this agent")

            # Get nodes and edges
            nodes = await repo.get_nodes_by_agent(UUID(agent_id))
            edges = await repo.get_edges_by_agent(UUID(agent_id))

            # Validation results
            validation_results = {"is_valid": True, "errors": [], "warnings": [], "recommendations": []}

            # Node validation
            node_names = set()
            node_types = {}
            for node in nodes:
                # Check for duplicate names
                if node.name in node_names:
                    validation_results["errors"].append(f"Duplicate node name: '{node.name}'")
                    validation_results["is_valid"] = False
                node_names.add(node.name)

                # Count node types
                node_types[node.node_type] = node_types.get(node.node_type, 0) + 1

            # Graph structure validation
            if "start" not in node_types:
                validation_results["errors"].append("Graph must have at least one 'start' node")
                validation_results["is_valid"] = False
            elif node_types["start"] > 1:
                validation_results["warnings"].append(
                    f"Graph has {node_types['start']} start nodes - consider using only one"
                )

            if "end" not in node_types:
                validation_results["warnings"].append("Graph should have at least one 'end' node")

            # Edge validation
            node_id_to_name = {node.id: node.name for node in nodes}
            connected_nodes = set()

            for edge in edges:
                from_name = node_id_to_name.get(edge.from_node_id)
                to_name = node_id_to_name.get(edge.to_node_id)

                if not from_name:
                    validation_results["errors"].append(
                        f"Edge references non-existent from_node ID: {edge.from_node_id}"
                    )
                    validation_results["is_valid"] = False
                if not to_name:
                    validation_results["errors"].append(f"Edge references non-existent to_node ID: {edge.to_node_id}")
                    validation_results["is_valid"] = False

                if from_name and to_name:
                    connected_nodes.add(from_name)
                    connected_nodes.add(to_name)

            # Check for isolated nodes
            for node in nodes:
                if node.name not in connected_nodes and node.node_type not in ["start", "end"]:
                    validation_results["warnings"].append(f"Node '{node.name}' is not connected to any other nodes")

            # Recommendations
            if len(nodes) == 0:
                validation_results["recommendations"].append(
                    "Start by adding a 'start' node to begin building your graph"
                )
            elif len(edges) == 0 and len(nodes) > 1:
                validation_results["recommendations"].append(
                    "Add edges to connect your nodes and define execution flow"
                )

            if "router" in node_types and node_types["router"] > 0:
                validation_results["recommendations"].append(
                    "Ensure router nodes have proper conditions defined for all possible paths"
                )

            return success_response(
                f"Validation complete for agent '{agent.name}'",
                {
                    "agent_id": agent_id,
                    "validation": validation_results,
                    "statistics": {
                        "total_nodes": len(nodes),
                        "total_edges": len(edges),
                        "node_type_counts": node_types,
                        "connected_nodes": len(connected_nodes),
                    },
                },
            )

    except Exception as e:
        logger.error(f"Failed to validate agent structure: {e}")
        return error_response(f"Error validating agent structure: {str(e)}")


__all__ = ["mcp"]
