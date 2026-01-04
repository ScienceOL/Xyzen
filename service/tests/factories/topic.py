from uuid import uuid4

from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.topic import Topic, TopicCreate


class TopicFactory(ModelFactory[Topic]):
    """Factory for Topic model."""

    __model__ = Topic


class TopicCreateFactory(ModelFactory[TopicCreate]):
    """Factory for TopicCreate schema."""

    __model__ = TopicCreate

    is_active = True
    session_id = Use(uuid4)
