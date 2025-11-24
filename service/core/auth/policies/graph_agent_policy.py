from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from common.code import ErrCode
from models.graph import GraphAgent
from repos.graph import GraphRepository

from .resource_policy import ResourcePolicyBase


class GraphAgentPolicy(ResourcePolicyBase[GraphAgent]):
    def __init__(self, db: AsyncSession) -> None:
        self.agent_repo = GraphRepository(db)

    async def authorize_read(self, resource_id: UUID, user_id: str) -> GraphAgent:
        graph_agent = await self.agent_repo.get_graph_agent_by_id(resource_id)
        if not graph_agent:
            raise ErrCode.GRAPH_AGENT_NOT_FOUND.with_messages(f"Graph Agent with ID {resource_id} not found")

        if graph_agent.user_id == user_id:
            return graph_agent

        raise ErrCode.GRAPH_AGENT_NOT_OWNED.with_messages(
            f"User {user_id} is not the owner of Graph Agent {resource_id}"
        )

    async def authorize_write(self, resource_id: UUID, user_id: str) -> GraphAgent:
        graph_agent = await self.agent_repo.get_graph_agent_by_id(resource_id)
        if not graph_agent:
            raise ErrCode.GRAPH_AGENT_NOT_FOUND.with_messages(f"Graph Agent with ID {resource_id} not found")

        if graph_agent.user_id == user_id:
            return graph_agent

        raise ErrCode.GRAPH_AGENT_NOT_OWNED.with_messages(
            f"User {user_id} is not the owner of Graph Agent {resource_id}"
        )

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> GraphAgent:
        graph_agent = await self.agent_repo.get_graph_agent_by_id(resource_id)
        if not graph_agent:
            raise ErrCode.GRAPH_AGENT_NOT_FOUND.with_messages(f"Graph Agent with ID {resource_id} not found")

        if graph_agent.user_id == user_id:
            return graph_agent

        raise ErrCode.GRAPH_AGENT_NOT_OWNED.with_messages(
            f"User {user_id} is not the owner of Graph Agent {resource_id}"
        )
