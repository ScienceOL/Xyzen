from .mcps import McpServer
from .agents import (
    Agent,
    AgentCreate,
    AgentRead,
    AgentReadWithSessions,
    AgentUpdate,
)
from .messages import (
    Message,
    MessageCreate,
    MessageRead,
    MessageUpdate,
)
from .providers import (
    Provider,
    ProviderCreate,
    ProviderRead,
    ProviderUpdate,
)
from .sessions import (
    Session,
    SessionCreate,
    SessionRead,
    SessionUpdate,
)
from .topics import (
    Topic,
    TopicCreate,
    TopicRead,
    TopicUpdate,
)

__all__ = [
    "Agent",
    "AgentCreate",
    "AgentRead",
    "AgentReadWithSessions",
    "AgentUpdate",
    "Message",
    "MessageCreate",
    "MessageRead",
    "MessageUpdate",
    "Provider",
    "ProviderCreate",
    "ProviderRead",
    "ProviderUpdate",
    "Session",
    "SessionCreate",
    "SessionRead",
    "SessionUpdate",
    "Topic",
    "TopicCreate",
    "TopicRead",
    "TopicUpdate",
]

# 解决前向引用问题
# 在所有模型都加载完成后重建模型，确保字符串形式的类型提示能够正确解析
AgentRead.model_rebuild()
AgentReadWithSessions.model_rebuild()
SessionRead.model_rebuild()
