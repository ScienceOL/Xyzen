from dataclasses import dataclass
from enum import StrEnum

from langchain.chat_models import BaseChatModel
from litellm.types.utils import ModelInfo


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


class LiteLLMProvider(StrEnum):
    # Keep this since the config is copied from LiteLLM
    OPENAI = "openai"
    AZURE = "azure"
    GEMINI = "gemini"
    VERTEX_AI = "vertex_ai-language-models"


@dataclass
class ModelInstance:
    llm: BaseChatModel
    config: ModelInfo
