from uuid import uuid4

from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.message import Message, MessageCreate


class MessageFactory(ModelFactory[Message]):
    """Factory for Message model."""

    __model__ = Message


class MessageCreateFactory(ModelFactory[MessageCreate]):
    """Factory for MessageCreate schema."""

    __model__ = MessageCreate

    role = "user"
    topic_id = Use(uuid4)
    thinking_content = None
