from dataclasses import dataclass
from enum import StrEnum

from langchain.chat_models import BaseChatModel

from app.core.model_registry import ModelInfo


class ModelMode(StrEnum):
    """Enumeration of available model modes."""

    CHAT = "chat"
    EMBEDDING = "embedding"
    COMPLETION = "completion"


class Modality(StrEnum):
    """Enumeration of available modality types."""

    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


@dataclass
class ModelInstance:
    llm: BaseChatModel
    config: ModelInfo
