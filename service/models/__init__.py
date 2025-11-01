from .agent import Agent, AgentReadWithDetails
from .consume import ConsumeRecord
from .graph import GraphAgent, GraphEdge, GraphNode
from .links import AgentMcpServerLink
from .mcp import McpServer
from .message import Message, MessageRead
from .provider import Provider
from .sessions import Session, SessionReadWithTopics
from .tool import Tool, ToolFunction, ToolVersion
from .topic import Topic, TopicRead, TopicReadWithMessages

__all__ = [
    "Agent",
    "ConsumeRecord",
    "AgentMcpServerLink",
    "McpServer",
    "Message",
    "MessageRead",
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
]

# Rebuild models with forward references after all models are imported
# This ensures that Pydantic can properly resolve forward references
try:
    # Rebuild in dependency order: leaf dependencies first
    # TopicReadWithMessages depends on MessageRead
    TopicReadWithMessages.model_rebuild()
    # SessionReadWithTopics depends on TopicRead
    SessionReadWithTopics.model_rebuild()
    # AgentReadWithDetails depends on McpServer
    AgentReadWithDetails.model_rebuild()
except Exception as e:
    import logging

    logging.getLogger(__name__).warning(f"Failed to rebuild models with forward references: {e}")
