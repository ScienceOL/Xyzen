"""
Builtin Graph Agent Registry - Auto-discovery and Registration System

This module provides automatic discovery and registration of builtin graph agents.
It mirrors the MCP server registry pattern but is specifically designed for
graph agents that use LangGraph for execution.
"""

import importlib
import logging
from pathlib import Path
from typing import Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from .base_graph_agent import BaseBuiltinGraphAgent

logger = logging.getLogger(__name__)


class BuiltinGraphAgentRegistry:
    """
    Registry for builtin graph agents with automatic discovery and registration.

    This registry automatically scans the current directory for Python modules
    containing BaseBuiltinGraphAgent instances and registers them for use.
    """

    def __init__(self) -> None:
        self.agents: dict[str, dict[str, Any]] = {}
        self._discover_agents()

    def _discover_agents(self) -> None:
        """Automatically discover all builtin graph agents in the current directory."""
        current_dir = Path(__file__).parent
        python_files = [f for f in current_dir.glob("*.py") if f.name not in ["__init__.py", "base_graph_agent.py"]]

        for file_path in python_files:
            module_name = file_path.stem
            self._try_import_agent(module_name)

    def _try_import_agent(self, module_name: str) -> None:
        """Safely attempt to import and register agents from a module."""
        try:
            # Dynamically import the module
            module = importlib.import_module(f".{module_name}", package=__package__)

            # Find BaseBuiltinGraphAgent instances
            agent_instances = self._extract_agent_instances(module, module_name)

            for agent_instance in agent_instances:
                # Generate configuration for the agent
                agent_config = self._generate_agent_config(module_name, agent_instance)

                # Use agent name as key, with fallback to module name
                agent_key = self._generate_agent_key(agent_instance, module_name)
                self.agents[agent_key] = agent_config

                logger.info(f"Successfully registered builtin graph agent: {agent_key}")

        except Exception as e:
            logger.warning(f"Failed to import builtin graph agent from {module_name}: {e}")
            # Don't raise exception to ensure system startup isn't affected

    def _extract_agent_instances(self, module: Any, module_name: str) -> list[BaseBuiltinGraphAgent]:
        """Extract BaseBuiltinGraphAgent instances from a module."""
        agent_instances = []

        # Look for BaseBuiltinGraphAgent instances
        for attr_name in dir(module):
            attr_value = getattr(module, attr_name)

            # Check if it's an instance of BaseBuiltinGraphAgent
            if isinstance(attr_value, BaseBuiltinGraphAgent):
                agent_instances.append(attr_value)
                logger.debug(f"Found builtin graph agent instance: {attr_name} in {module_name}")

        return agent_instances

    def _generate_agent_key(self, agent: BaseBuiltinGraphAgent, module_name: str) -> str:
        """Generate a unique key for the agent."""
        # Use a sanitized version of the agent name, fallback to module name
        if hasattr(agent, "name") and agent.name:
            # Convert to lowercase and replace spaces/special chars with underscores
            key = agent.name.lower().replace(" ", "_").replace("-", "_")
            # Remove any non-alphanumeric characters except underscores
            key = "".join(c for c in key if c.isalnum() or c == "_")
            return key
        return module_name

    def _generate_agent_config(self, module_name: str, agent: BaseBuiltinGraphAgent) -> dict[str, Any]:
        """Generate configuration for an agent."""
        metadata = agent.get_metadata()

        return {
            "agent": agent,
            "module_name": module_name,
            "metadata": metadata,
            "name": metadata.get("name", f"{module_name.title()} Agent"),
            "description": metadata.get("description", ""),
            "version": metadata.get("version", "1.0.0"),
            "capabilities": metadata.get("capabilities", []),
            "tags": metadata.get("tags", []),
            "author": metadata.get("author"),
            "license": metadata.get("license"),
            "display_name": agent.get_display_name(),
            "icon": agent.get_icon(),
            "supports_streaming": agent.supports_streaming(),
            "required_tools": agent.get_required_tools(),
            "estimated_execution_time": agent.get_estimated_execution_time(),
        }

    def get_agent(self, name: str) -> BaseBuiltinGraphAgent | None:
        """Get a builtin graph agent by name."""
        agent_config = self.agents.get(name)
        return agent_config["agent"] if agent_config else None

    def get_agent_config(self, name: str) -> dict[str, Any] | None:
        """Get the complete configuration for a builtin graph agent."""
        return self.agents.get(name)

    def get_all_agents(self) -> dict[str, BaseBuiltinGraphAgent]:
        """Get all registered builtin graph agents."""
        return {name: config["agent"] for name, config in self.agents.items()}

    def get_all_configs(self) -> dict[str, dict[str, Any]]:
        """Get all agent configurations."""
        return self.agents.copy()

    def list_agent_names(self) -> list[str]:
        """Get a list of all registered agent names."""
        return list(self.agents.keys())

    def list_agent_metadata(self) -> list[dict[str, Any]]:
        """Get metadata for all registered agents."""
        return [config["metadata"] for config in self.agents.values()]

    def get_agents_by_tag(self, tag: str) -> list[BaseBuiltinGraphAgent]:
        """Get all agents that have a specific tag."""
        matching_agents = []
        for config in self.agents.values():
            if tag in config.get("tags", []):
                matching_agents.append(config["agent"])
        return matching_agents

    def get_agents_by_capability(self, capability: str) -> list[BaseBuiltinGraphAgent]:
        """Get all agents that have a specific capability."""
        matching_agents = []
        for config in self.agents.values():
            if capability in config.get("capabilities", []):
                matching_agents.append(config["agent"])
        return matching_agents

    def register_agent(
        self,
        name: str,
        agent: BaseBuiltinGraphAgent,
        override: bool = False,
    ) -> None:
        """
        Manually register a builtin graph agent.

        Args:
            name: Name to register the agent under
            agent: The agent instance to register
            override: Whether to override existing agent with same name
        """
        if name in self.agents and not override:
            raise ValueError(f"Agent '{name}' is already registered. Use override=True to replace.")

        config = self._generate_agent_config(name, agent)
        self.agents[name] = config
        logger.info(f"Manually registered builtin graph agent: {name}")

    def unregister_agent(self, name: str) -> bool:
        """
        Unregister a builtin graph agent.

        Args:
            name: Name of the agent to unregister

        Returns:
            bool: True if agent was found and removed, False otherwise
        """
        if name in self.agents:
            del self.agents[name]
            logger.info(f"Unregistered builtin graph agent: {name}")
            return True
        return False

    def validate_agent(self, name: str) -> bool:
        """
        Validate that an agent is properly configured and functional.

        Args:
            name: Name of the agent to validate

        Returns:
            bool: True if agent is valid, False otherwise
        """
        agent = self.get_agent(name)
        if not agent:
            return False

        try:
            # Test that the agent can provide its basic requirements
            agent.get_state_schema()
            agent.get_metadata()
            # Note: We don't build the graph here as it might be expensive
            return True
        except Exception as e:
            logger.warning(f"Agent validation failed for '{name}': {e}")
            return False

    def get_registry_stats(self) -> dict[str, Any]:
        """Get statistics about the registry."""
        total_agents = len(self.agents)
        capabilities: set[str] = set()
        tags: set[str] = set()

        for config in self.agents.values():
            capabilities.update(config.get("capabilities", []))
            tags.update(config.get("tags", []))

        return {
            "total_agents": total_agents,
            "unique_capabilities": len(capabilities),
            "unique_tags": len(tags),
            "agent_names": self.list_agent_names(),
            "all_capabilities": sorted(list(capabilities)),
            "all_tags": sorted(list(tags)),
        }

    async def seed_to_database(self, db: AsyncSession) -> dict[str, Any]:
        """
        Seed all builtin graph agents to the database with is_official=True.

        This method creates or updates GraphAgent records in the database for all
        registered builtin agents. It ensures that builtin agents are accessible
        through the standard agent API alongside user-created agents.

        Args:
            db: Async database session

        Returns:
            dict: Statistics about the seeding operation
                - created: Number of new agents created
                - updated: Number of existing agents updated
                - failed: Number of agents that failed to sync
                - total: Total number of agents processed
        """
        from models.graph import GraphAgent, GraphAgentCreate
        from repos.graph import GraphRepository

        repo = GraphRepository(db)
        stats = {"created": 0, "updated": 0, "failed": 0, "total": len(self.agents)}

        for agent_name, agent_config in self.agents.items():
            try:
                agent_instance = agent_config["agent"]
                metadata = agent_config["metadata"]

                # Check if agent already exists by name and is_official=True
                existing_query = select(GraphAgent).where(
                    GraphAgent.name == metadata.get("name", agent_name),
                    GraphAgent.is_official == True,  # noqa: E712
                )
                result = await db.exec(existing_query)
                existing_agent = result.first()

                # Prepare agent data
                agent_data = {
                    "name": metadata.get("name", agent_name),
                    "description": metadata.get("description", ""),
                    "state_schema": agent_instance.get_state_schema(),
                    "is_active": True,
                    "is_published": True,  # Official agents are published by default
                    "is_official": True,
                    "parent_agent_id": None,
                }

                if existing_agent:
                    # Update existing agent
                    for key, value in agent_data.items():
                        if key not in ["name"]:  # Don't update name
                            setattr(existing_agent, key, value)
                    db.add(existing_agent)
                    await db.flush()
                    await db.refresh(existing_agent)
                    stats["updated"] += 1
                    logger.info(f"Updated official graph agent in database: {agent_name}")
                else:
                    # Create new agent with system user_id
                    agent_create = GraphAgentCreate(**agent_data)
                    new_agent = await repo.create_graph_agent(agent_create, user_id="system")
                    await db.flush()
                    await db.refresh(new_agent)
                    stats["created"] += 1
                    logger.info(f"Created official graph agent in database: {agent_name}")

            except Exception as e:
                stats["failed"] += 1
                logger.error(f"Failed to seed builtin agent '{agent_name}' to database: {e}")
                # Continue with other agents even if one fails

        logger.info(
            f"Builtin agent database seeding completed: "
            f"{stats['created']} created, {stats['updated']} updated, "
            f"{stats['failed']} failed out of {stats['total']} total"
        )

        return stats


# Create global registry instance
registry = BuiltinGraphAgentRegistry()

# Export the registry and discovered agents
__all__ = ["registry", "BaseBuiltinGraphAgent"]

# Dynamic export of all discovered agent instances
for agent_name, agent_config in registry.get_all_configs().items():
    try:
        # Export the agent instance with its registered name
        globals()[agent_name] = agent_config["agent"]

        # Also export with a standardized name format
        export_name = f"{agent_name}_agent"
        globals()[export_name] = agent_config["agent"]

        logger.debug(f"Exported agent instance: {agent_name}")
    except Exception as e:
        logger.warning(f"Failed to export agent instance {agent_name}: {e}")

logger.info(
    f"Builtin Graph Agent Registry initialized with {len(registry.agents)} agents: {list(registry.agents.keys())}"
)
