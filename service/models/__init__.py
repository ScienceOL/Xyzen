import logging

from .agent import Agent, AgentReadWithDetails
from .citation import Citation, CitationCreate, CitationRead
from .consume import ConsumeRecord
from .file import File, FileCreate, FileRead, FileReadWithUrl, FileUpdate
from .graph import GraphAgent, GraphEdge, GraphNode
from .links import AgentMcpServerLink
from .mcp import McpServer
from .message import (
    Message,
    MessageRead,
    MessageReadWithCitations,
    MessageReadWithFiles,
    MessageReadWithFilesAndCitations,
)
from .provider import Provider
from .redemption import RedemptionCode, RedemptionHistory, UserWallet
from .sessions import Session, SessionReadWithTopics
from .smithery_cache import SmitheryServersCache
from .tool import Tool, ToolFunction, ToolVersion
from .topic import Topic, TopicRead, TopicReadWithMessages

logger = logging.getLogger(__name__)

__all__ = [
    "Agent",
    "Citation",
    "CitationCreate",
    "CitationRead",
    "ConsumeRecord",
    "File",
    "FileCreate",
    "FileRead",
    "FileReadWithUrl",
    "FileUpdate",
    "AgentMcpServerLink",
    "McpServer",
    "Message",
    "MessageRead",
    "MessageReadWithCitations",
    "MessageReadWithFiles",
    "MessageReadWithFilesAndCitations",
    "Provider",
    "Session",
    "SessionReadWithTopics",
    "Tool",
    "ToolVersion",
    "ToolFunction",
    "Topic",
    "GraphAgent",
    "GraphNode",
    "GraphEdge",
    "TopicRead",
    "TopicReadWithMessages",
    "SmitheryServersCache",
    "RedemptionCode",
    "RedemptionHistory",
    "UserWallet",
]

# Rebuild models with forward references after all models are imported
# This ensures that Pydantic can properly resolve forward references
try:
    # Rebuild in dependency order: leaf dependencies first
    # CitationRead is a leaf dependency
    CitationRead.model_rebuild()
    # MessageReadWithFiles depends on FileRead
    MessageReadWithFiles.model_rebuild()
    # MessageReadWithCitations depends on CitationRead
    MessageReadWithCitations.model_rebuild()
    # MessageReadWithFilesAndCitations depends on FileRead and CitationRead
    MessageReadWithFilesAndCitations.model_rebuild()
    # TopicReadWithMessages depends on MessageRead
    TopicReadWithMessages.model_rebuild()
    # SessionReadWithTopics depends on TopicRead
    SessionReadWithTopics.model_rebuild()
    # AgentReadWithDetails depends on McpServer
    AgentReadWithDetails.model_rebuild()
except (NameError, TypeError, Exception) as e:
    logger.warning(
        f"Could not rebuild Pydantic models with forward references. "
        f"This might cause validation errors at runtime. Error: {e}",
        exc_info=True,
    )
