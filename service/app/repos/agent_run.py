import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent_run import AgentRun as AgentRunModel
from app.models.agent_run import AgentRunCreate, AgentRunRead, AgentRunUpdate

logger = logging.getLogger(__name__)


class AgentRunRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, agent_run_id: UUID) -> AgentRunModel | None:
        """
        Fetches an agent run by its ID.

        Args:
            agent_run_id: The UUID of the agent run to fetch.

        Returns:
            The AgentRunModel, or None if not found.
        """
        logger.debug(f"Fetching agent run with id: {agent_run_id}")
        return await self.db.get(AgentRunModel, agent_run_id)

    async def get_by_message_id(self, message_id: UUID) -> AgentRunModel | None:
        """
        Fetches an agent run by its associated message ID.

        Args:
            message_id: The UUID of the message.

        Returns:
            The AgentRunModel, or None if not found.
        """
        logger.debug(f"Fetching agent run for message_id: {message_id}")
        statement = select(AgentRunModel).where(AgentRunModel.message_id == message_id)
        result = await self.db.exec(statement)
        return result.first()

    async def get_by_execution_id(self, execution_id: str) -> AgentRunModel | None:
        """
        Fetches an agent run by its execution ID.

        Args:
            execution_id: The execution ID string.

        Returns:
            The AgentRunModel, or None if not found.
        """
        logger.debug(f"Fetching agent run with execution_id: {execution_id}")
        statement = select(AgentRunModel).where(AgentRunModel.execution_id == execution_id)
        result = await self.db.exec(statement)
        return result.first()

    async def create(self, agent_run_data: AgentRunCreate) -> AgentRunModel:
        """
        Creates a new agent run record.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the agent run object is populated with DB-defaults before being returned.

        Args:
            agent_run_data: The Pydantic model containing the data for the new agent run.

        Returns:
            The newly created AgentRunModel instance.
        """
        logger.debug(f"Creating new agent run for message_id: {agent_run_data.message_id}")
        agent_run = AgentRunModel.model_validate(agent_run_data)
        self.db.add(agent_run)
        await self.db.flush()
        await self.db.refresh(agent_run)
        return agent_run

    async def update(self, agent_run_id: UUID, update_data: AgentRunUpdate) -> AgentRunModel | None:
        """
        Updates an existing agent run.
        This function does NOT commit the transaction.

        Args:
            agent_run_id: The UUID of the agent run to update.
            update_data: The Pydantic model containing the update data.

        Returns:
            The updated AgentRunModel instance, or None if not found.
        """
        logger.debug(f"Updating agent run with id: {agent_run_id}")
        agent_run = await self.db.get(AgentRunModel, agent_run_id)
        if not agent_run:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(agent_run, field, value)

        self.db.add(agent_run)
        await self.db.flush()
        await self.db.refresh(agent_run)
        return agent_run

    async def append_timeline_entry(self, agent_run_id: UUID, entry: dict[str, Any]) -> None:
        """
        Append a single entry to the timeline in node_data.

        This method atomically adds a timeline entry and updates convenience maps
        for node_end events.

        Args:
            agent_run_id: The UUID of the agent run to update.
            entry: A timeline entry dictionary with event_type, timestamp, etc.
        """
        agent_run = await self.db.get(AgentRunModel, agent_run_id)
        if not agent_run:
            logger.warning(f"AgentRun {agent_run_id} not found for timeline append")
            return

        # Initialize node_data if needed
        node_data = agent_run.node_data or {"timeline": [], "node_outputs": {}, "node_order": [], "node_names": {}}
        node_data.setdefault("timeline", []).append(entry)

        # For node_end events, also update convenience maps
        if entry.get("event_type") == "node_end":
            node_id = entry.get("node_id")
            if node_id:
                # Store output
                if "output" in entry:
                    node_data.setdefault("node_outputs", {})[node_id] = entry["output"]
                # Track order
                if node_id not in node_data.get("node_order", []):
                    node_data.setdefault("node_order", []).append(node_id)
                # Store name
                if entry.get("node_name"):
                    node_data.setdefault("node_names", {})[node_id] = entry["node_name"]

        agent_run.node_data = node_data
        flag_modified(agent_run, "node_data")  # Force SQLAlchemy to detect JSON change
        self.db.add(agent_run)
        await self.db.flush()
        logger.debug(f"Appended timeline entry to AgentRun {agent_run_id}: {entry.get('event_type')}")

    async def append_timeline_entries(
        self,
        agent_run_id: UUID,
        new_entries: list[dict[str, Any]],
        node_outputs: dict[str, Any] | None = None,
    ) -> None:
        """
        Append multiple entries to the timeline atomically.

        Args:
            agent_run_id: The UUID of the agent run to update.
            new_entries: List of timeline entry dictionaries.
            node_outputs: Optional node outputs to merge into node_data.
        """
        agent_run = await self.db.get(AgentRunModel, agent_run_id)
        if not agent_run:
            logger.warning(f"AgentRun {agent_run_id} not found for timeline append")
            return

        node_data = agent_run.node_data or {"timeline": [], "node_outputs": {}, "node_order": [], "node_names": {}}
        node_data.setdefault("timeline", []).extend(new_entries)

        if node_outputs:
            node_data.setdefault("node_outputs", {}).update(node_outputs)

        agent_run.node_data = node_data
        flag_modified(agent_run, "node_data")  # Force SQLAlchemy to detect JSON change
        self.db.add(agent_run)
        await self.db.flush()
        logger.debug(f"Appended {len(new_entries)} timeline entries to AgentRun {agent_run_id}")

    async def finalize(
        self,
        agent_run_id: UUID,
        status: str,
        ended_at: float,
        duration_ms: int,
        final_node_data: dict[str, Any] | None = None,
    ) -> AgentRunModel | None:
        """
        Finalize an agent run with completion status.

        Args:
            agent_run_id: The UUID of the agent run to finalize.
            status: Final status ("completed", "failed", "cancelled").
            ended_at: Unix timestamp when execution ended.
            duration_ms: Total execution duration in milliseconds.
            final_node_data: Optional final node data to merge.

        Returns:
            The updated AgentRunModel, or None if not found.
        """
        agent_run = await self.db.get(AgentRunModel, agent_run_id)
        if not agent_run:
            return None

        agent_run.status = status
        agent_run.ended_at = ended_at
        agent_run.duration_ms = duration_ms

        if final_node_data:
            node_data = agent_run.node_data or {}
            # Merge final_node_data into existing node_data
            for key, value in final_node_data.items():
                if key == "timeline" and "timeline" in node_data:
                    # Extend timeline rather than replace
                    node_data["timeline"].extend(value)
                elif key in ("node_outputs", "node_names") and key in node_data:
                    # Merge dictionaries
                    node_data[key].update(value)
                elif key == "node_order" and "node_order" in node_data:
                    # Extend order (deduplicated)
                    for item in value:
                        if item not in node_data["node_order"]:
                            node_data["node_order"].append(item)
                else:
                    node_data[key] = value
            agent_run.node_data = node_data
            flag_modified(agent_run, "node_data")  # Force SQLAlchemy to detect JSON change

        self.db.add(agent_run)
        await self.db.flush()
        await self.db.refresh(agent_run)
        logger.debug(f"Finalized AgentRun {agent_run_id} with status={status}")
        return agent_run

    async def delete(self, agent_run_id: UUID) -> bool:
        """
        Deletes an agent run by its ID.
        This function does NOT commit the transaction.

        Args:
            agent_run_id: The UUID of the agent run to delete.

        Returns:
            True if the agent run was deleted, False if not found.
        """
        logger.debug(f"Deleting agent run with id: {agent_run_id}")
        agent_run = await self.db.get(AgentRunModel, agent_run_id)
        if not agent_run:
            return False

        await self.db.delete(agent_run)
        await self.db.flush()
        return True

    async def delete_by_message_id(self, message_id: UUID) -> bool:
        """
        Deletes an agent run by its associated message ID.
        This function does NOT commit the transaction.

        Args:
            message_id: The UUID of the message.

        Returns:
            True if the agent run was deleted, False if not found.
        """
        logger.debug(f"Deleting agent run for message_id: {message_id}")
        agent_run = await self.get_by_message_id(message_id)
        if not agent_run:
            return False

        await self.db.delete(agent_run)
        await self.db.flush()
        return True

    async def get_as_read(self, message_id: UUID) -> AgentRunRead | None:
        """
        Fetches an agent run for a message as AgentRunRead model.

        Args:
            message_id: The UUID of the message.

        Returns:
            AgentRunRead instance, or None if not found.
        """
        agent_run = await self.get_by_message_id(message_id)
        if not agent_run:
            return None
        return AgentRunRead.model_validate(agent_run)
