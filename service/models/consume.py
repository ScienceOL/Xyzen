"""消费记录模型

记录用户的消费历史和统计信息
"""

from datetime import datetime, timezone
from typing import Callable, ClassVar, Optional, Union
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Column
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlmodel import Field, SQLModel


class ConsumeRecord(SQLModel, table=True):
    """消费记录表 - 记录每次用户的消费明细"""

    __tablename__: ClassVar[Union[str, Callable[..., str]]] = "consume_records"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(index=True, description="用户ID")
    biz_no: Optional[int] = Field(
        default=None,
        sa_column_kwargs={"autoincrement": True},
        unique=True,
        index=True,
        description="业务唯一ID（用于幂等）",
    )
    amount: int = Field(description="消费金额")
    auth_provider: str = Field(index=True, description="认证提供商（如 bohr_app）")

    # 可选业务字段
    sku_id: Optional[int] = Field(default=None, description="SKU ID")
    scene: Optional[str] = Field(default=None, description="消费场景")
    session_id: Optional[UUID] = Field(default=None, description="关联的会话ID")
    topic_id: Optional[UUID] = Field(default=None, description="关联的主题ID")
    message_id: Optional[UUID] = Field(default=None, description="关联的消息ID")
    description: Optional[str] = Field(default=None, description="消费描述")

    # 扣费状态
    consume_state: str = Field(default="pending", description="消费状态: pending/success/failed")
    remote_error: Optional[str] = Field(default=None, description="远程扣费错误信息")
    remote_response: Optional[str] = Field(default=None, description="远程扣费响应")

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="创建时间",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
        description="更新时间",
    )


class UserConsumeSummary(SQLModel, table=True):
    """用户消费汇总表 - 记录每个用户的消费总量"""

    __tablename__: ClassVar[Union[str, Callable[..., str]]] = "user_consume_summaries"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: str = Field(unique=True, index=True, description="用户ID")
    auth_provider: str = Field(index=True, description="认证提供商")
    total_amount: int = Field(default=0, sa_type=BigInteger, description="总消费金额")
    total_count: int = Field(default=0, description="总消费次数")
    success_count: int = Field(default=0, description="成功消费次数")
    failed_count: int = Field(default=0, description="失败消费次数")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
        description="创建时间",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False, onupdate=lambda: datetime.now(timezone.utc)),
        description="更新时间",
    )
