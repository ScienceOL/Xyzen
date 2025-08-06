from typing import TYPE_CHECKING, List
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .providers import Provider, ProviderRead
    from .sessions import Session, SessionRead


class AgentBase(SQLModel):
    """
    Agent 模型的基础字段。
    """

    name: str = Field(index=True, description="Agent的名称，方便用户识别")
    description: str | None = Field(default=None, description="对Agent功能的详细描述")
    prompt: str = Field(description="Agent的核心系统提示词(System Prompt)，用于定义其行为和角色")
    username: str = Field(index=True, description="创建该Agent的用户名 (来自Casdoor)")

    # Agent必须由一个Provider提供支持。
    provider_id: int = Field(foreign_key="providers.id", index=True)


class Agent(AgentBase, table=True):
    """
    数据库中的 Agent 表模型。
    """

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)

    # 定义与Session的一对多关系
    sessions: List["Session"] = Relationship(back_populates="agent")

    # 建立与 Provider 的 ORM 关系。
    provider: "Provider" = Relationship()


class AgentCreate(AgentBase):
    """
    创建Agent时API接收的数据模型。
    现在创建Agent时必须指定一个 provider_id。
    """

    pass


class AgentRead(AgentBase):
    """
    从API读取(返回)Agent信息时的数据模型。
    """

    id: UUID

    # 在返回Agent信息时，一并返回其使用的Provider的详细信息，利于前端展示Agent配置。
    provider: "ProviderRead"


class AgentReadWithSessions(AgentRead):
    """
    读取Agent信息，并附带其关联的所有Session信息。
    """

    sessions: List["SessionRead"] = []


class AgentUpdate(SQLModel):
    """
    更新Agent时API接收的数据模型，所有字段都是可选的。
    """

    name: str | None = None
    description: str | None = None
    prompt: str | None = None
    provider_id: int | None = None
