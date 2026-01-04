from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.sessions import Session, SessionCreate


class SessionFactory(ModelFactory[Session]):
    """Factory for Session model."""

    __model__ = Session


class SessionCreateFactory(ModelFactory[SessionCreate]):
    """Factory for SessionCreate schema."""

    __model__ = SessionCreate

    is_active = True
    agent_id = None
    provider_id = None
    model = None
    google_search_enabled = False
