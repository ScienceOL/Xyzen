import logging
from uuid import UUID

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
