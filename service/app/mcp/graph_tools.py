# """
# MCP Server for Graph Agent Tools - Simple AI Agent Creation

# This module provides tools for creating graph-based AI agents. Use `create_agent_with_graph`
# for the simplest approach, then `inspect_agent` to verify and `run_agent` to test.

# ## 🚀 RECOMMENDED: CREATE COMPLETE AGENT IN ONE CALL

# Use `create_agent_with_graph()` - it's the easiest way to create working agents:

# ```python
# create_agent_with_graph(
#     name="Q&A Assistant",
#     description="Answers user questions",
#     state_schema={
#         "type": "object",
#         "properties": {
#             "messages": {"type": "array"},
#             "current_step": {"type": "string"},
#             "user_input": {"type": "string"},
#             "final_output": {"type": "string"}
#         },
#         "required": ["messages", "current_step"]
#     },
#     nodes=[
#         {"name": "start", "node_type": "start", "config": {}},
#         {
#             "name": "assistant",
#             "node_type": "llm",
#             "config": {
#                 "model": "gpt-5",
#                 "provider_name": "system",
#                 "system_prompt": "You are a helpful assistant. Answer questions clearly."
#             }
#         },
#         {"name": "end", "node_type": "end", "config": {}}
#     ],
#     edges=[
#         {"from_node": "start", "to_node": "assistant"},
#         {"from_node": "assistant", "to_node": "end"}
#     ]
# )
# ```

# Then ALWAYS use `inspect_agent(agent_id)` to verify your agent before running it!

# ## 🚨 CRITICAL: ALWAYS USE SYSTEM PROVIDER

# For ALL LLM nodes: `"provider_name": "system"` is REQUIRED!

# ## 📈 WORKFLOW: CREATE → INSPECT → RUN

# 1. **Create**: Use `create_agent_with_graph()` (copy the template above)
# 2. **Inspect**: Use `inspect_agent(agent_id)` to verify structure
# 3. **Run**: Use `run_agent(agent_id, input_state)` to test

# ## 📋 QUICK NODE REFERENCE

# - **"start"**: Entry point, config: `{}`
# - **"llm"**: AI processing, config: `{"model": "gpt-5", "provider_name": "system", "system_prompt": "..."}`
# - **"tool"**: Function calls, config: `{"tool_name": "function_name"}`
# - **"router"**: Branching logic, config: `{"conditions": [...], "default_target": "node_name"}`
# - **"end"**: Exit point, config: `{}`

# ## 🔧 ADVANCED: Individual Functions

# If you need to build agents step-by-step instead of using `create_agent_with_graph`:
# - `create_agent()`: Create empty agent
# - `add_node()`: Add individual nodes
# - `add_edge()`: Connect nodes
# - `define_state()`: Customize state schema

# ## 🛠️ ESSENTIAL TOOLS

# - `inspect_agent(agent_id)`: **ALWAYS use this to verify your agent!**
# - `validate_agent_structure(agent_id)`: Check for problems
# - `list_agents()`: See all your agents
# - `run_agent(agent_id, input_state)`: Execute your agent
# """

# import json
# import logging
# from typing import Any
# from uuid import UUID

# from fastmcp import FastMCP
# from fastmcp.server.auth import JWTVerifier, TokenVerifier
# from fastmcp.server.dependencies import AccessToken, get_access_token

# from app.core.chat.langgraph import execute_graph_agent_sync
# from app.infra.database import AsyncSessionLocal
# from app.middleware.auth import AuthProvider, UserInfo
# from app.middleware.auth import AuthProvider as InternalAuthProvider
# from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
# from app.models.graph import (
#     GraphAgentCreate,
#     GraphAgentUpdate,
#     GraphEdgeCreate,
#     GraphNodeCreate,
# )
# from app.repos.graph import GraphRepository

# logger = logging.getLogger(__name__)

# # MCP Server instance
# mcp = FastMCP("graph-tools")

# # 创建认证提供者 - 使用 TokenVerifier 类型但赋值给变量名 auth
# # 这个变量会被 MCP 自动发现机制识别为 AuthProvider（因为 TokenVerifier 继承自 AuthProvider）
# auth: TokenVerifier

# match InternalAuthProvider.get_provider_name():
#     case "bohrium":
#         auth = JWTVerifier(
#             public_key=InternalAuthProvider.public_key,
#         )
#     case "casdoor":
#         auth = JWTVerifier(
#             jwks_uri=InternalAuthProvider.jwks_uri,
#         )
#     case "bohr_app":
#         auth = BohrAppTokenVerifier(
#             api_url=InternalAuthProvider.issuer,
#             x_app_key="xyzen-uuid1760783737",
#         )
#     case _:
#         raise ValueError(f"Unsupported authentication provider: {InternalAuthProvider.get_provider_name()}")


# def error_response(message: str) -> str:
#     """Helper function to return consistent error responses"""
#     return json.dumps(
#         {
#             "status": "error",
#             "message": message,
#         },
#         indent=2,
#     )


# def get_current_user() -> UserInfo:
#     """
#     Dependency function to get the current user from the access token.
#     """
#     access_token: AccessToken | None = get_access_token()
#     if not access_token:
#         raise ValueError("Access token is required for this operation.")

#     user_info = AuthProvider.parse_user_info(access_token.claims)
#     if not user_info or not user_info.id:
#         raise ValueError(f"Hello, unknown! Your scopes are: {', '.join(access_token.scopes)}")
#     return user_info


# async def get_node_id_by_name(repo: GraphRepository, agent_id: UUID, node_name: str) -> UUID:
#     """Helper to get node ID by name within an agent"""
#     nodes = await repo.get_nodes_by_agent(agent_id)
#     for node in nodes:
#         if node.name == node_name:
#             return node.id
#     raise ValueError(f"Node '{node_name}' not found in agent {agent_id}")


# def get_node_config_template(node_type: str) -> dict[str, Any]:
#     """Get a template configuration for a specific node type"""
#     templates = {
#         "llm": {
#             "model": "gpt-5",
#             "provider_name": "system",
#             "system_prompt": "You are a helpful assistant. Process the input and provide a response.",
#         },
#         "tool": {"tool_name": "example_tool", "parameters": {}, "timeout_seconds": 30},
#         "router": {
#             "conditions": [{"field": "intent", "operator": "equals", "value": "search", "target": "search_node"}],
#             "default_target": "default_node",
#         },
#         "subagent": {"agent_id": "sub-agent-uuid", "input_mapping": {}, "output_mapping": {}},
#         "start": {},
#         "end": {"output_format": "json"},
#     }
#     return templates.get(node_type, {})


# def success_response(message: str, data: dict[str, Any] | None = None) -> str:
#     """Helper function to return consistent success responses"""
#     response = {
#         "status": "success",
#         "message": message,
#     }
#     if data:
#         response.update(data)
#     return json.dumps(response, indent=2)


# @mcp.tool
# async def create_agent(
#     name: str,
#     description: str,
# ) -> str:
#     """
#     ⚠️ ADVANCED: Create empty agent (requires more steps)

#     Creates an empty agent that you must build manually with add_node() and add_edge().
#     Most users should use create_agent_with_graph() instead for simpler workflow.

#     Args:
#         name: Agent name
#         description: What the agent does

#     Returns:
#         JSON with agent_id for use in add_node() and add_edge() calls

#     💡 RECOMMENDED: Use create_agent_with_graph() instead for easier agent creation!
#     """
#     user_info = get_current_user()

#     try:
#         if not name or not description:
#             return error_response("Missing required fields: name, description")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Create agent with basic state schema
#             agent_data = GraphAgentCreate(
#                 name=name,
#                 description=description,
#                 state_schema={
#                     "type": "object",
#                     "properties": {
#                         "messages": {"type": "array"},
#                         "current_step": {"type": "string"},
#                         "user_input": {"type": "string"},
#                         "final_output": {"type": "string"},
#                         "execution_context": {"type": "object"},
#                     },
#                 },
#             )

#             agent = await repo.create_graph_agent(agent_data, user_info.id)
#             await session.commit()

#             logger.info(f"Created graph agent: {agent.id}")
#             return json.dumps(
#                 {
#                     "status": "success",
#                     "message": f"Graph agent '{name}' created successfully",
#                     "agent_id": str(agent.id),
#                     "name": name,
#                     "description": description,
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to create agent: {e}")
#         return error_response(f"Error creating agent: {str(e)}")


# @mcp.tool
# async def define_state(agent_id: str, state_schema: dict[str, Any]) -> str:
#     """
#     ⚠️ ADVANCED: Customize state schema (rarely needed)

#     Updates the data structure that flows between nodes. Most users should skip this
#     since create_agent_with_graph() includes a good default schema.

#     Args:
#         agent_id: Agent ID from create_agent()
#         state_schema: JSON schema object

#     💡 RECOMMENDED: Use create_agent_with_graph() with default schema instead!
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id or not state_schema:
#             return error_response("Missing required fields: agent_id, state_schema")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Check agent exists and user has permission
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to modify this agent")

#             update_data = GraphAgentUpdate(state_schema=state_schema)
#             updated_agent = await repo.update_graph_agent(UUID(agent_id), update_data)

#             if not updated_agent:
#                 return error_response(f"Failed to update agent {agent_id}")

#             await session.commit()

#             logger.info(f"Updated state schema for agent: {agent_id}")
#             return json.dumps(
#                 {
#                     "status": "success",
#                     "message": f"Successfully updated state schema for agent {agent_id}",
#                     "agent_id": agent_id,
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to define state: {e}")
#         return error_response(f"Error defining state: {str(e)}")


# @mcp.tool
# async def add_node(
#     agent_id: str,
#     name: str,
#     node_type: str,
#     config: dict[str, Any],
#     position_x: float | None = None,
#     position_y: float | None = None,
# ) -> str:
#     """
#     ⚠️ ADVANCED: Add individual nodes (manual method)

#     Adds a single node to an agent created with create_agent().
#     Most users should use create_agent_with_graph() instead for simpler workflow.

#     Args:
#         agent_id: Agent ID from create_agent()
#         name: Unique node name
#         node_type: "start", "llm", "tool", "router", "end"
#         config: Node configuration (LLM nodes need "provider_name": "system")

#     💡 RECOMMENDED: Use create_agent_with_graph() instead for easier agent creation!
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id or not name or not node_type:
#             return error_response("Missing required fields: agent_id, name, node_type")

#         # Validate node type
#         valid_types = ["llm", "tool", "router", "subagent", "start", "end"]
#         if node_type not in valid_types:
#             return error_response(f"Invalid node type '{node_type}'. Valid types: {valid_types}")

#         # Validate provider_name for LLM nodes
#         if node_type == "llm" and config.get("provider_name"):
#             from app.core.providers import get_user_provider_manager

#             async with AsyncSessionLocal() as temp_session:
#                 try:
#                     user_provider_manager = await get_user_provider_manager(user_info.id, temp_session)
#                     provider = user_provider_manager.get_provider_config(config["provider_name"])
#                     if not provider:
#                         return error_response(
#                             f"Provider '{config['provider_name']}' not found or not available to user"
#                         )
#                 except Exception as e:
#                     logger.warning(f"Could not validate provider '{config.get('provider_name')}': {e}")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Check agent exists and user has permission
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to modify this agent")

#             node_data = GraphNodeCreate(
#                 name=name,
#                 node_type=node_type,
#                 config=config,
#                 graph_agent_id=UUID(agent_id),
#                 position_x=position_x,
#                 position_y=position_y,
#             )

#             node = await repo.create_node(node_data)
#             await session.commit()

#             logger.info(f"Added node '{name}' to agent {agent_id}")
#             return json.dumps(
#                 {
#                     "status": "success",
#                     "message": f"Successfully added {node_type} node '{name}'",
#                     "node_id": str(node.id),
#                     "agent_id": agent_id,
#                     "name": name,
#                     "node_type": node_type,
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to add node: {e}")
#         return error_response(f"Error adding node: {str(e)}")


# @mcp.tool
# async def add_edge(
#     agent_id: str,
#     from_node: str,
#     to_node: str,
#     condition: dict[str, Any] | None = None,
#     label: str | None = None,
# ) -> str:
#     """
#     ⚠️ ADVANCED: Connect nodes manually

#     Connects nodes created with add_node(). Node names must match exactly.
#     Most users should use create_agent_with_graph() instead for simpler workflow.

#     Args:
#         agent_id: Agent ID from create_agent()
#         from_node: Source node name (must exist)
#         to_node: Target node name (must exist)

#     💡 RECOMMENDED: Use create_agent_with_graph() instead for easier agent creation!
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id or not from_node or not to_node:
#             return error_response("Missing required fields: agent_id, from_node, to_node")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Check agent exists and user has permission
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to modify this agent")

#             agent_uuid = UUID(agent_id)

#             # Get node IDs by names
#             from_node_id = await get_node_id_by_name(repo, agent_uuid, from_node)
#             to_node_id = await get_node_id_by_name(repo, agent_uuid, to_node)

#             edge_data = GraphEdgeCreate(
#                 from_node_id=from_node_id,
#                 to_node_id=to_node_id,
#                 condition=condition,
#                 graph_agent_id=agent_uuid,
#                 label=label,
#             )

#             edge = await repo.create_edge(edge_data)
#             await session.commit()

#             logger.info(f"Added edge from '{from_node}' to '{to_node}' in agent {agent_id}")
#             return json.dumps(
#                 {
#                     "status": "success",
#                     "message": f"Successfully added edge from '{from_node}' to '{to_node}'",
#                     "edge_id": str(edge.id),
#                     "agent_id": agent_id,
#                     "from_node": from_node,
#                     "to_node": to_node,
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to add edge: {e}")
#         return error_response(f"Error adding edge: {str(e)}")


# @mcp.tool
# async def run_agent(agent_id: str, input_state: dict[str, Any]) -> str:
#     """
#     🚀 ESSENTIAL: Execute your agent

#     Runs your agent with the provided input. Use this to test and interact with your agent.

#     Args:
#         agent_id: Agent ID from create_agent_with_graph()
#         input_state: Input data - MUST include these fields:
#                     {"user_input": "question", "messages": [], "current_step": "start"}

#     Returns:
#         JSON with execution results and the agent's response

#     ✅ EXAMPLE:
#     run_agent(
#         agent_id="your-agent-id",
#         input_state={
#             "user_input": "Hello, how are you?",
#             "messages": [],
#             "current_step": "start"
#         }
#     )

#     💡 TIP: Use inspect_agent() first to verify your agent is properly structured!
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id or not input_state:
#             return error_response("Missing required fields: agent_id, input_state")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Check agent exists and user has permission
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to execute this agent")

#             # Add user_id to input state for execution context
#             enhanced_input_state = {
#                 **input_state,
#                 "execution_context": {**input_state.get("execution_context", {}), "user_id": user_info.id},
#             }

#             # Execute graph agent synchronously
#             result = await execute_graph_agent_sync(session, UUID(agent_id), enhanced_input_state, user_info.id)

#             if result.success:
#                 return json.dumps(
#                     {
#                         "status": "success",
#                         "message": f"Agent executed successfully in {result.execution_time_ms}ms",
#                         "agent_id": agent_id,
#                         "final_state": result.final_state,
#                         "execution_time_ms": result.execution_time_ms,
#                     },
#                     indent=2,
#                 )
#             else:
#                 return json.dumps(
#                     {
#                         "status": "error",
#                         "message": result.error_message or "Agent execution failed",
#                         "agent_id": agent_id,
#                         "execution_time_ms": result.execution_time_ms,
#                     },
#                     indent=2,
#                 )

#     except Exception as e:
#         logger.error(f"Failed to run agent: {e}")
#         return error_response(f"Error running agent: {str(e)}")


# @mcp.tool
# async def list_agents() -> str:
#     """
#     List all graph agents for the current user.

#     Returns:
#         JSON string containing list of agents
#     """
#     user_info = get_current_user()

#     try:
#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             agents = await repo.get_graph_agents_by_user(user_info.id)

#             if not agents:
#                 return json.dumps(
#                     {
#                         "status": "success",
#                         "message": "No graph agents found for current user",
#                         "agents": [],
#                         "count": 0,
#                     },
#                     indent=2,
#                 )

#             agent_list = []
#             for agent in agents:
#                 agent_info = {
#                     "id": str(agent.id),
#                     "name": agent.name,
#                     "description": agent.description,
#                     "is_active": agent.is_active,
#                     "created_at": agent.created_at.isoformat(),
#                     "updated_at": agent.updated_at.isoformat(),
#                 }
#                 agent_list.append(agent_info)

#             return json.dumps(
#                 {
#                     "status": "success",
#                     "agents": agent_list,
#                     "count": len(agents),
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to list agents: {e}")
#         return error_response(f"Error listing agents: {str(e)}")


# @mcp.tool
# async def create_agent_with_graph(
#     name: str,
#     description: str,
#     state_schema: dict[str, Any],
#     nodes: list[dict[str, Any]],
#     edges: list[dict[str, Any]],
# ) -> str:
#     """
#     🚀 RECOMMENDED: Create a complete working agent in one call

#     This is the easiest and most reliable way to create graph agents.
#     Copy the template below and modify it for your needs.

#     Args:
#         name: Short name for your agent
#         description: What the agent does
#         state_schema: Use the template below (copy exactly)
#         nodes: List of nodes (start, processing nodes, end)
#         edges: List of connections between nodes

#     Returns:
#         JSON with agent_id and creation confirmation

#     ✅ COPY THIS TEMPLATE (works every time):

#     create_agent_with_graph(
#         name="Your Agent Name",
#         description="What your agent does",
#         state_schema={
#             "type": "object",
#             "properties": {
#                 "messages": {"type": "array"},
#                 "current_step": {"type": "string"},
#                 "user_input": {"type": "string"},
#                 "final_output": {"type": "string"}
#             },
#             "required": ["messages", "current_step"]
#         },
#         nodes=[
#             {"name": "start", "node_type": "start", "config": {}},
#             {
#                 "name": "assistant",
#                 "node_type": "llm",
#                 "config": {
#                     "model": "gpt-5",
#                     "provider_name": "system",
#                     "system_prompt": "Your custom prompt here"
#                 }
#             },
#             {"name": "end", "node_type": "end", "config": {}}
#         ],
#         edges=[
#             {"from_node": "start", "to_node": "assistant"},
#             {"from_node": "assistant", "to_node": "end"}
#         ]
#     )

#     🔧 CUSTOMIZE:
#     - Change the agent name and description
#     - Modify the system_prompt for your use case
#     - Add more nodes between "start" and "end" if needed
#     - Connect new nodes with additional edges

#     ⚠️ CRITICAL: Always include "provider_name": "system" for LLM nodes!

#     📋 NEXT STEPS:
#     1. Run this function to get agent_id
#     2. Use inspect_agent(agent_id) to verify
#     3. Use run_agent(agent_id, input_state) to test
#     """
#     user_info = get_current_user()

#     try:
#         if not name or not description or not state_schema or not nodes:
#             return error_response("Missing required fields: name, description, state_schema, nodes")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Create agent first
#             agent_data = GraphAgentCreate(
#                 name=name,
#                 description=description,
#                 state_schema=state_schema,
#             )
#             agent = await repo.create_graph_agent(agent_data, user_info.id)

#             # Create nodes and build name-to-ID mapping
#             node_id_map = {}
#             for node_data in nodes:
#                 node_create = GraphNodeCreate(
#                     name=node_data["name"],
#                     node_type=node_data["node_type"],
#                     config=node_data.get("config", {}),
#                     graph_agent_id=agent.id,
#                     position_x=node_data.get("position_x"),
#                     position_y=node_data.get("position_y"),
#                 )
#                 node = await repo.create_node(node_create)
#                 node_id_map[node.name] = node.id

#             # Create edges with resolved node IDs
#             edges_created = 0
#             for edge_data in edges:
#                 from_name = edge_data["from_node"]
#                 to_name = edge_data["to_node"]

#                 if from_name not in node_id_map or to_name not in node_id_map:
#                     logger.warning(f"Skipping edge from {from_name} to {to_name}: nodes not found")
#                     continue

#                 edge_create = GraphEdgeCreate(
#                     from_node_id=node_id_map[from_name],
#                     to_node_id=node_id_map[to_name],
#                     condition=edge_data.get("condition"),
#                     graph_agent_id=agent.id,
#                     label=edge_data.get("label"),
#                 )
#                 await repo.create_edge(edge_create)
#                 edges_created += 1

#             await session.commit()

#             logger.info(f"Created complete graph agent: {agent.id}")
#             return json.dumps(
#                 {
#                     "status": "success",
#                     "message": (
#                         f"Successfully created graph agent '{name}' with {len(nodes)} nodes and {edges_created} edges"
#                     ),
#                     "agent_id": str(agent.id),
#                     "name": name,
#                     "description": description,
#                     "nodes_created": len(nodes),
#                     "edges_created": edges_created,
#                 },
#                 indent=2,
#             )

#     except Exception as e:
#         logger.error(f"Failed to create agent with graph: {e}")
#         return error_response(f"Error creating agent with graph: {str(e)}")


# @mcp.tool
# async def inspect_agent(agent_id: str) -> str:
#     """
#     🔍 ESSENTIAL: View your agent structure (ALWAYS use this!)

#     This shows you exactly what your agent looks like - its nodes, connections,
#     and whether it's properly structured. Use this after creating any agent!

#     Args:
#         agent_id: The agent_id from create_agent_with_graph() result

#     Returns:
#         Complete agent information including:
#         - All nodes and their configurations
#         - All connections (edges)
#         - Validation status (errors/warnings)
#         - Structure overview

#     💡 USE THIS TO:
#     - Verify your agent was created correctly
#     - Debug connection issues
#     - Check node configurations
#     - Confirm the agent is ready to run

#     Example:
#         inspect_agent(agent_id="your-agent-id-here")
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id:
#             return error_response("Missing required field: agent_id")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Get agent details
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to inspect this agent")

#             # Get nodes and edges
#             nodes = await repo.get_nodes_by_agent(UUID(agent_id))
#             edges = await repo.get_edges_by_agent(UUID(agent_id))

#             # Build node details
#             node_details = []
#             node_name_map = {}
#             for node in nodes:
#                 node_info = {
#                     "id": str(node.id),
#                     "name": node.name,
#                     "type": node.node_type,
#                     "config": node.config,
#                     "position": {"x": node.position_x, "y": node.position_y},
#                 }
#                 node_details.append(node_info)
#                 node_name_map[node.id] = node.name

#             # Build edge details
#             edge_details = []
#             for edge in edges:
#                 edge_info = {
#                     "id": str(edge.id),
#                     "from_node": node_name_map.get(edge.from_node_id, "UNKNOWN"),
#                     "to_node": node_name_map.get(edge.to_node_id, "UNKNOWN"),
#                     "condition": edge.condition,
#                     "label": edge.label,
#                 }
#                 edge_details.append(edge_info)

#             # Graph statistics and validation
#             node_types = {}
#             for node in nodes:
#                 node_types[node.node_type] = node_types.get(node.node_type, 0) + 1

#             has_start_node = any(node.node_type == "start" for node in nodes)
#             has_end_node = any(node.node_type == "end" for node in nodes)

#             graph_validation = {
#                 "has_start_node": has_start_node,
#                 "has_end_node": has_end_node,
#                 "is_complete": has_start_node and has_end_node,
#                 "total_nodes": len(nodes),
#                 "total_edges": len(edges),
#                 "node_type_counts": node_types,
#             }

#             return success_response(
#                 f"Agent '{agent.name}' inspection complete",
#                 {
#                     "agent": {
#                         "id": str(agent.id),
#                         "name": agent.name,
#                         "description": agent.description,
#                         "state_schema": agent.state_schema,
#                         "is_active": agent.is_active,
#                         "created_at": agent.created_at.isoformat(),
#                         "updated_at": agent.updated_at.isoformat(),
#                     },
#                     "nodes": node_details,
#                     "edges": edge_details,
#                     "graph_validation": graph_validation,
#                 },
#             )

#     except Exception as e:
#         logger.error(f"Failed to inspect agent: {e}")
#         return error_response(f"Error inspecting agent: {str(e)}")


# @mcp.tool
# async def get_node_template(node_type: str) -> str:
#     """
#     Get a configuration template for a specific node type.

#     This tool provides ready-to-use configuration templates for each node type,
#     which can be used as starting points when creating nodes.

#     Args:
#         node_type: Type of node ('llm', 'tool', 'router', 'subagent', 'start', 'end')

#     Returns:
#         JSON string with template configuration and usage guidance

#     Example Usage:
#         get_node_template(node_type="llm")
#         get_node_template(node_type="router")
#     """
#     try:
#         valid_types = ["llm", "tool", "router", "subagent", "start", "end"]
#         if node_type not in valid_types:
#             return error_response(f"Invalid node type '{node_type}'. Valid types: {valid_types}")

#         template = get_node_config_template(node_type)

#         return success_response(
#             f"Configuration template for {node_type} node",
#             {
#                 "node_type": node_type,
#                 "template": template,
#                 "usage_example": f"""add_node(
# agent_id="your-agent-id",
# name="your_node_name",
# node_type="{node_type}",
# config={json.dumps(template, indent=8)}
# )""",
#             },
#         )

#     except Exception as e:
#         logger.error(f"Failed to get node template: {e}")
#         return error_response(f"Error getting node template: {str(e)}")


# @mcp.tool
# async def list_user_providers() -> str:
#     """
#     List available AI providers for the current user.

#     This tool shows all providers (both system and user-specific) that can be
#     used in the provider_name field when creating LLM nodes.

#     Returns:
#         JSON string with list of available providers including:
#         - Provider names that can be used in LLM node configurations
#         - Provider types (OpenAI, Anthropic, etc.)
#         - Whether each provider is currently active
#         - Provider availability status

#     Example Usage:
#         list_user_providers()

#     Use the returned provider names in LLM node configurations:
#         config = {
#             "model": "gpt-5",
#             "provider_name": "system",  # Use a name from this list
#             "system_prompt": "..."
#         }
#     """
#     user_info = get_current_user()

#     try:
#         from app.core.providers import get_user_provider_manager

#         async with AsyncSessionLocal() as session:
#             user_provider_manager = await get_user_provider_manager(user_info.id, session)

#             # Get list of providers
#             providers_info = user_provider_manager.list_providers()

#             return success_response(
#                 f"Found {len(providers_info)} available providers for user",
#                 {
#                     "providers": providers_info,
#                     "count": len(providers_info),
#                     "usage_note": "Use the 'name' field values in LLM node 'provider_name' configuration",
#                 },
#             )

#     except Exception as e:
#         logger.error(f"Failed to list user providers: {e}")
#         return error_response(f"Error listing user providers: {str(e)}")


# @mcp.tool
# async def delete_agent(agent_id: str) -> str:
#     """
#     🗑️ DELETE: Remove an agent permanently

#     Permanently deletes a graph agent and all its nodes and edges. This action cannot be undone!

#     Args:
#         agent_id: The agent_id from create_agent_with_graph() or list_agents()

#     Returns:
#         JSON confirmation of deletion

#     ⚠️ WARNING: This action is PERMANENT and cannot be undone!

#     💡 SAFETY TIP: Use inspect_agent() first to verify you're deleting the correct agent

#     Example:
#         delete_agent(agent_id="12345678-1234-1234-1234-123456789abc")
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id:
#             return error_response("Missing required field: agent_id")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Check agent exists and user has permission
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to delete this agent")

#             # Get agent details for confirmation message
#             agent_name = agent.name

#             # Get counts for confirmation
#             nodes = await repo.get_nodes_by_agent(UUID(agent_id))
#             edges = await repo.get_edges_by_agent(UUID(agent_id))
#             node_count = len(nodes)
#             edge_count = len(edges)

#             # Delete the agent (this should cascade to delete nodes and edges)
#             success = await repo.delete_graph_agent(UUID(agent_id))

#             if not success:
#                 return error_response(f"Failed to delete agent {agent_id}")

#             await session.commit()

#             logger.info(
#                 f"Deleted graph agent: {agent_id} ('{agent_name}') with {node_count} nodes and {edge_count} edges"
#             )
#             return success_response(
#                 f"Successfully deleted agent '{agent_name}' and all its components",
#                 {
#                     "agent_id": agent_id,
#                     "agent_name": agent_name,
#                     "nodes_deleted": node_count,
#                     "edges_deleted": edge_count,
#                     "deletion_time": "permanent",
#                 },
#             )

#     except Exception as e:
#         logger.error(f"Failed to delete agent: {e}")
#         return error_response(f"Error deleting agent: {str(e)}")


# @mcp.tool
# async def validate_agent_structure(agent_id: str) -> str:
#     """
#     Validate the structure and configuration of a graph agent.

#     This tool performs comprehensive validation checks on an agent's structure,
#     including node configurations, connectivity, and graph completeness.

#     Args:
#         agent_id: UUID of the graph agent to validate

#     Returns:
#         JSON string with validation results and recommendations

#     Example Usage:
#         validate_agent_structure(agent_id="12345678-1234-1234-1234-123456789abc")
#     """
#     user_info = get_current_user()

#     try:
#         if not agent_id:
#             return error_response("Missing required field: agent_id")

#         async with AsyncSessionLocal() as session:
#             repo = GraphRepository(session)

#             # Get agent and check permissions
#             agent = await repo.get_graph_agent_by_id(UUID(agent_id))
#             if not agent:
#                 return error_response(f"Agent {agent_id} not found")

#             if agent.user_id != user_info.id:
#                 return error_response("Permission denied: You don't have permission to validate this agent")

#             # Get nodes and edges
#             nodes = await repo.get_nodes_by_agent(UUID(agent_id))
#             edges = await repo.get_edges_by_agent(UUID(agent_id))

#             # Validation results
#             validation_results = {"is_valid": True, "errors": [], "warnings": [], "recommendations": []}

#             # Node validation
#             node_names = set()
#             node_types = {}
#             for node in nodes:
#                 # Check for duplicate names
#                 if node.name in node_names:
#                     validation_results["errors"].append(f"Duplicate node name: '{node.name}'")
#                     validation_results["is_valid"] = False
#                 node_names.add(node.name)

#                 # Count node types
#                 node_types[node.node_type] = node_types.get(node.node_type, 0) + 1

#             # Graph structure validation
#             if "start" not in node_types:
#                 validation_results["errors"].append("Graph must have at least one 'start' node")
#                 validation_results["is_valid"] = False
#             elif node_types["start"] > 1:
#                 validation_results["warnings"].append(
#                     f"Graph has {node_types['start']} start nodes - consider using only one"
#                 )

#             if "end" not in node_types:
#                 validation_results["warnings"].append("Graph should have at least one 'end' node")

#             # Edge validation
#             node_id_to_name = {node.id: node.name for node in nodes}
#             connected_nodes = set()

#             for edge in edges:
#                 from_name = node_id_to_name.get(edge.from_node_id)
#                 to_name = node_id_to_name.get(edge.to_node_id)

#                 if not from_name:
#                     validation_results["errors"].append(
#                         f"Edge references non-existent from_node ID: {edge.from_node_id}"
#                     )
#                     validation_results["is_valid"] = False
#                 if not to_name:
#                     validation_results["errors"].append(f"Edge references non-existent to_node ID: {edge.to_node_id}")
#                     validation_results["is_valid"] = False

#                 if from_name and to_name:
#                     connected_nodes.add(from_name)
#                     connected_nodes.add(to_name)

#             # Check for isolated nodes
#             for node in nodes:
#                 if node.name not in connected_nodes and node.node_type not in ["start", "end"]:
#                     validation_results["warnings"].append(f"Node '{node.name}' is not connected to any other nodes")

#             # Recommendations
#             if len(nodes) == 0:
#                 validation_results["recommendations"].append(
#                     "Start by adding a 'start' node to begin building your graph"
#                 )
#             elif len(edges) == 0 and len(nodes) > 1:
#                 validation_results["recommendations"].append(
#                     "Add edges to connect your nodes and define execution flow"
#                 )

#             if "router" in node_types and node_types["router"] > 0:
#                 validation_results["recommendations"].append(
#                     "Ensure router nodes have proper conditions defined for all possible paths"
#                 )

#             return success_response(
#                 f"Validation complete for agent '{agent.name}'",
#                 {
#                     "agent_id": agent_id,
#                     "validation": validation_results,
#                     "statistics": {
#                         "total_nodes": len(nodes),
#                         "total_edges": len(edges),
#                         "node_type_counts": node_types,
#                         "connected_nodes": len(connected_nodes),
#                     },
#                 },
#             )

#     except Exception as e:
#         logger.error(f"Failed to validate agent structure: {e}")
#         return error_response(f"Error validating agent structure: {str(e)}")


# __all__ = ["mcp"]
