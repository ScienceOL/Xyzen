from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.agent import Agent, AgentCreate, AgentScope


class AgentFactory(ModelFactory[Agent]):
    """Factory for Agent model."""

    __model__ = Agent


class AgentCreateFactory(ModelFactory[AgentCreate]):
    """Factory for AgentCreate schema."""

    __model__ = AgentCreate

    scope = Use(lambda: AgentScope.USER)
    knowledge_set_id = None
    provider_id = None
