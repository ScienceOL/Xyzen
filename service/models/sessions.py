from typing import List, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

# 导入新的 Agent 模型
if TYPE_CHECKING:
    from .agents import Agent, AgentRead
    from .topics import Topic, TopicRead


class SessionBase(SQLModel):
    """     
    Base model for sessions.
    """
    
    name: str
    description: str | None = None
    is_active: bool = True
    username: str = Field(index=True, description="The username from Casdoor")
    agent_id: UUID = Field(foreign_key="agent.id", index=True, description="关联的Agent ID")


class Session(SessionBase, table=True):
    # 使用 default_factory=uuid4 确保在创建时自动生成UUID
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)

    # 与 Agent 模型的关系
    agent: "Agent" = Relationship(back_populates="sessions")
    
    # 与 Topic 模型的关系
    topics: List["Topic"] = Relationship(back_populates="session", sa_relationship_kwargs={"lazy": "selectin"})


class SessionCreate(SessionBase):
    # 创建时需要传递 agent_id，其他字段继承自 SessionBase
    pass


class SessionRead(SessionBase):
    id: UUID
    
    # 在读取Session时，可以一并返回其关联的Topic和Agent信息
    topics: List["TopicRead"] = []
    agent: "AgentRead"


class SessionUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None

# 注意：所有模型的重建(model_rebuild)应该在所有相关模型都加载后，
# 在一个中心位置（如 FastAPI 应用的启动事件或模型包的 __init__.py）统一调用，
# 以确保所有前向引用（字符串形式的类型提示）都能被正确解析。