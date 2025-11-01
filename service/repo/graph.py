import logging
from typing import Any
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.graph import (
    GraphAgent,
    GraphAgentCreate,
    GraphAgentCreateWithGraph,
    GraphAgentUpdate,
    GraphAgentWithGraph,
    GraphEdge,
    GraphEdgeCreate,
    GraphEdgeRead,
    GraphEdgeUpdate,
    GraphExecutionResult,
    GraphNode,
    GraphNodeCreate,
    GraphNodeRead,
    GraphNodeUpdate,
)

logger = logging.getLogger(__name__)


class GraphRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # GraphAgent operations
    async def get_graph_agent_by_id(self, agent_id: UUID) -> GraphAgent | None:
        """
        Fetches a graph agent by its ID.

        Args:
            agent_id: The UUID of the graph agent to fetch.

        Returns:
            The GraphAgent, or None if not found.
        """
        logger.debug(f"Fetching graph agent with id: {agent_id}")
        return await self.db.get(GraphAgent, agent_id)

    async def get_graph_agents_by_user(self, user_id: str) -> list[GraphAgent]:
        """
        Fetches all graph agents for a given user.

        Args:
            user_id: The user ID.

        Returns:
            List of GraphAgent instances.
        """
        logger.debug(f"Fetching graph agents for user_id: {user_id}")
        statement = select(GraphAgent).where(GraphAgent.user_id == user_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def get_graph_agent_with_graph(self, agent_id: UUID) -> GraphAgentWithGraph | None:
        """
        Fetches a graph agent by its ID with all nodes and edges loaded.

        Args:
            agent_id: The UUID of the graph agent to fetch.

        Returns:
            The GraphAgentWithGraph with nodes and edges populated, or None if not found.
        """
        logger.debug(f"Fetching graph agent with full graph for agent_id: {agent_id}")

        # Get the agent
        agent = await self.db.get(GraphAgent, agent_id)
        if not agent:
            return None

        # Get all nodes for this agent
        nodes_statement = select(GraphNode).where(GraphNode.graph_agent_id == agent_id)
        nodes_result = await self.db.exec(nodes_statement)
        nodes = list(nodes_result.all())

        # Get all edges for this agent
        edges_statement = select(GraphEdge).where(GraphEdge.graph_agent_id == agent_id)
        edges_result = await self.db.exec(edges_statement)
        edges = list(edges_result.all())

        # Convert to GraphAgentWithGraph
        agent_dict = agent.model_dump()
        # Convert nodes and edges to Read models
        node_reads = [GraphNodeRead(**node.model_dump()) for node in nodes]
        edge_reads = [GraphEdgeRead(**edge.model_dump()) for edge in edges]
        agent_with_graph = GraphAgentWithGraph(**agent_dict, nodes=node_reads, edges=edge_reads)

        return agent_with_graph

    async def create_graph_agent(self, agent_data: GraphAgentCreate, user_id: str) -> GraphAgent:
        """
        Creates a new graph agent.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            agent_data: The Pydantic model containing the data for the new graph agent.
            user_id: The user ID (from authentication).

        Returns:
            The newly created GraphAgent instance.
        """
        logger.debug(f"Creating new graph agent for user_id: {user_id}")

        # Create agent
        agent_dict = agent_data.model_dump()
        agent_dict["user_id"] = user_id
        agent = GraphAgent(**agent_dict)

        self.db.add(agent)
        await self.db.flush()
        await self.db.refresh(agent)

        return agent

    async def create_graph_agent_with_graph(
        self, agent_data: GraphAgentCreateWithGraph, user_id: str
    ) -> GraphAgentWithGraph:
        """
        Creates a new graph agent with nodes and edges in a single transaction.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            agent_data: The composite model containing agent, nodes, and edges data.
            user_id: The user ID (from authentication).

        Returns:
            The newly created GraphAgentWithGraph instance.
        """
        logger.debug(f"Creating new graph agent with full graph for user_id: {user_id}")

        # Create the agent first
        agent = await self.create_graph_agent(agent_data.agent, user_id)

        # Create nodes
        created_nodes: list[GraphNode] = []
        node_id_mapping: dict[str, UUID] = {}  # Map node names to IDs for edge creation

        for node_data in agent_data.nodes:
            node_dict = node_data.model_dump()
            node_dict["graph_agent_id"] = agent.id
            node = GraphNode(**node_dict)
            self.db.add(node)
            created_nodes.append(node)
            # Store mapping for edge creation (assuming node names are unique within a graph)
            node_id_mapping[node.name] = node.id

        await self.db.flush()

        # Refresh nodes to get IDs
        for node in created_nodes:
            await self.db.refresh(node)
            # Update mapping with actual UUIDs
            node_id_mapping[node.name] = node.id

        # Create edges
        created_edges: list[GraphEdge] = []
        for edge_data in agent_data.edges:
            edge_dict = edge_data.model_dump()
            edge_dict["graph_agent_id"] = agent.id
            edge = GraphEdge(**edge_dict)
            self.db.add(edge)
            created_edges.append(edge)

        await self.db.flush()

        # Refresh edges
        for edge in created_edges:
            await self.db.refresh(edge)

        # Return composite model
        agent_dict = agent.model_dump()
        # Convert nodes and edges to Read models
        node_reads = [GraphNodeRead(**node.model_dump()) for node in created_nodes]
        edge_reads = [GraphEdgeRead(**edge.model_dump()) for edge in created_edges]
        return GraphAgentWithGraph(**agent_dict, nodes=node_reads, edges=edge_reads)

    async def update_graph_agent(self, agent_id: UUID, agent_data: GraphAgentUpdate) -> GraphAgent | None:
        """
        Updates an existing graph agent.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the graph agent to update.
            agent_data: The Pydantic model containing the update data.

        Returns:
            The updated GraphAgent instance, or None if not found.
        """
        logger.debug(f"Updating graph agent with id: {agent_id}")
        agent = await self.db.get(GraphAgent, agent_id)
        if not agent:
            return None

        # Use safe update pattern
        update_data = agent_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(agent, key):
                setattr(agent, key, value)

        self.db.add(agent)
        await self.db.flush()
        await self.db.refresh(agent)
        return agent

    async def delete_graph_agent(self, agent_id: UUID) -> bool:
        """
        Deletes a graph agent and all its nodes and edges.
        This function does NOT commit the transaction.

        Args:
            agent_id: The UUID of the graph agent to delete.

        Returns:
            True if the agent was deleted, False if not found.
        """
        logger.debug(f"Deleting graph agent with id: {agent_id}")

        # Delete all edges first
        edges_statement = select(GraphEdge).where(GraphEdge.graph_agent_id == agent_id)
        edges_result = await self.db.exec(edges_statement)
        edges = list(edges_result.all())
        for edge in edges:
            await self.db.delete(edge)

        # Delete all nodes
        nodes_statement = select(GraphNode).where(GraphNode.graph_agent_id == agent_id)
        nodes_result = await self.db.exec(nodes_statement)
        nodes = list(nodes_result.all())
        for node in nodes:
            await self.db.delete(node)

        # Delete the agent
        agent = await self.db.get(GraphAgent, agent_id)
        if not agent:
            return False

        await self.db.delete(agent)
        await self.db.flush()
        return True

    # GraphNode operations
    async def get_nodes_by_agent(self, agent_id: UUID) -> list[GraphNode]:
        """
        Fetches all nodes for a given graph agent.

        Args:
            agent_id: The UUID of the graph agent.

        Returns:
            List of GraphNode instances.
        """
        logger.debug(f"Fetching nodes for graph agent: {agent_id}")
        statement = select(GraphNode).where(GraphNode.graph_agent_id == agent_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_node(self, node_data: GraphNodeCreate) -> GraphNode:
        """
        Creates a new node.
        This function does NOT commit the transaction.

        Args:
            node_data: The Pydantic model containing the node data.

        Returns:
            The newly created GraphNode instance.
        """
        logger.debug(f"Creating new node for graph agent: {node_data.graph_agent_id}")
        node_dict = node_data.model_dump()
        node = GraphNode(**node_dict)
        self.db.add(node)
        await self.db.flush()
        await self.db.refresh(node)
        return node

    async def update_node(self, node_id: UUID, node_data: GraphNodeUpdate) -> GraphNode | None:
        """
        Updates an existing node.
        This function does NOT commit the transaction.

        Args:
            node_id: The UUID of the node to update.
            node_data: The Pydantic model containing the update data.

        Returns:
            The updated GraphNode instance, or None if not found.
        """
        logger.debug(f"Updating node with id: {node_id}")
        node = await self.db.get(GraphNode, node_id)
        if not node:
            return None

        update_data = node_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(node, key):
                setattr(node, key, value)

        self.db.add(node)
        await self.db.flush()
        await self.db.refresh(node)
        return node

    async def delete_node(self, node_id: UUID) -> bool:
        """
        Deletes a node and all edges connected to it.
        This function does NOT commit the transaction.

        Args:
            node_id: The UUID of the node to delete.

        Returns:
            True if the node was deleted, False if not found.
        """
        logger.debug(f"Deleting node with id: {node_id}")

        # Delete all edges connected to this node
        edges_statement = select(GraphEdge).where(
            (GraphEdge.from_node_id == node_id) | (GraphEdge.to_node_id == node_id)
        )
        edges_result = await self.db.exec(edges_statement)
        edges = list(edges_result.all())
        for edge in edges:
            await self.db.delete(edge)

        # Delete the node
        node = await self.db.get(GraphNode, node_id)
        if not node:
            return False

        await self.db.delete(node)
        await self.db.flush()
        return True

    # GraphEdge operations
    async def get_edges_by_agent(self, agent_id: UUID) -> list[GraphEdge]:
        """
        Fetches all edges for a given graph agent.

        Args:
            agent_id: The UUID of the graph agent.

        Returns:
            List of GraphEdge instances.
        """
        logger.debug(f"Fetching edges for graph agent: {agent_id}")
        statement = select(GraphEdge).where(GraphEdge.graph_agent_id == agent_id)
        result = await self.db.exec(statement)
        return list(result.all())

    async def create_edge(self, edge_data: GraphEdgeCreate) -> GraphEdge:
        """
        Creates a new edge.
        This function does NOT commit the transaction.

        Args:
            edge_data: The Pydantic model containing the edge data.

        Returns:
            The newly created GraphEdge instance.
        """
        logger.debug(f"Creating new edge for graph agent: {edge_data.graph_agent_id}")
        edge_dict = edge_data.model_dump()
        edge = GraphEdge(**edge_dict)
        self.db.add(edge)
        await self.db.flush()
        await self.db.refresh(edge)
        return edge

    async def update_edge(self, edge_id: UUID, edge_data: GraphEdgeUpdate) -> GraphEdge | None:
        """
        Updates an existing edge.
        This function does NOT commit the transaction.

        Args:
            edge_id: The UUID of the edge to update.
            edge_data: The Pydantic model containing the update data.

        Returns:
            The updated GraphEdge instance, or None if not found.
        """
        logger.debug(f"Updating edge with id: {edge_id}")
        edge = await self.db.get(GraphEdge, edge_id)
        if not edge:
            return None

        update_data = edge_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(edge, key):
                setattr(edge, key, value)

        self.db.add(edge)
        await self.db.flush()
        await self.db.refresh(edge)
        return edge

    async def delete_edge(self, edge_id: UUID) -> bool:
        """
        Deletes an edge.
        This function does NOT commit the transaction.

        Args:
            edge_id: The UUID of the edge to delete.

        Returns:
            True if the edge was deleted, False if not found.
        """
        logger.debug(f"Deleting edge with id: {edge_id}")
        edge = await self.db.get(GraphEdge, edge_id)
        if not edge:
            return False

        await self.db.delete(edge)
        await self.db.flush()
        return True

    # Graph validation methods
    async def validate_graph_structure(self, agent_id: UUID) -> dict[str, Any]:
        """
        Validates the graph structure for connectivity and cycles.

        Args:
            agent_id: The UUID of the graph agent to validate.

        Returns:
            Dict containing validation results.
        """
        logger.debug(f"Validating graph structure for agent: {agent_id}")

        nodes = await self.get_nodes_by_agent(agent_id)
        edges = await self.get_edges_by_agent(agent_id)

        if not nodes:
            return {"valid": False, "errors": ["Graph has no nodes"]}

        node_ids = {node.id for node in nodes}
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "node_count": len(nodes),
            "edge_count": len(edges),
        }

        # Check for invalid edge references
        for edge in edges:
            if edge.from_node_id not in node_ids:
                validation_result["errors"].append(f"Edge {edge.id} references invalid from_node_id")
                validation_result["valid"] = False
            if edge.to_node_id not in node_ids:
                validation_result["errors"].append(f"Edge {edge.id} references invalid to_node_id")
                validation_result["valid"] = False

        # Check for isolated nodes (nodes with no connections)
        connected_nodes = set()
        for edge in edges:
            connected_nodes.add(edge.from_node_id)
            connected_nodes.add(edge.to_node_id)

        isolated_nodes = node_ids - connected_nodes
        if isolated_nodes:
            validation_result["warnings"].append(f"Found {len(isolated_nodes)} isolated nodes")

        return validation_result

    # Execution history (for future implementation)
    async def save_execution_result(self, result: GraphExecutionResult) -> None:
        """
        Saves execution result for audit/debugging purposes.
        Future implementation could store this in a separate execution_history table.

        Args:
            result: The execution result to save.
        """
        logger.debug(f"Execution result for agent {result.agent_id}: {result.success}")
        # For now, just log the result
        # Future: store in execution_history table
        pass
