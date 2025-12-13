import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlmodel import JSON, Column, Field, SQLModel


class McpServerCategory(str, Enum):
    """
    MCP Server 的功能分类。
    用于前端 UI 筛选（例如：在“联网配置”里只显示 SEARCH 类型的 MCP）。
    """

    SEARCH = "search"  # 搜索引擎 (Google, Bing, Tavily)
    CAPABILITY = "capability"  # 核心能力 (Code Interpreter, File System) - 往往作为 Agent 标配
    KNOWLEDGE = "knowledge"  # 知识库 (RAG, Notion, Obsidian)
    INTEGRATION = "integration"  # 第三方集成 (Slack, GitHub, Jira)
    GENERAL = "general"  # 其他


class MCPServerBase(SQLModel):
    # 将 scope 重命名为 category，意图更清晰
    category: McpServerCategory = Field(
        default=McpServerCategory.GENERAL,
        sa_column=sa.Column(
            sa.Enum(McpServerCategory, native_enum=True),
            nullable=False,
            index=True,
        ),
    )
    user_id: str = Field(default=None, index=True, description="The user ID of mcp server owner")
    name: str = Field(index=True)
    description: Optional[str] = Field(default=None)
    url: str
    token: str
    status: str = Field(default="unknown", index=True)
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, sa_column=Column(JSON))
    last_checked_at: Optional[datetime.datetime] = Field(default=None)


class McpServer(MCPServerBase, table=True):
    id: UUID = Field(default_factory=uuid4, index=True, primary_key=True)


class McpServerCreate(SQLModel):
    name: str
    description: str | None = None
    url: str
    token: str
    category: McpServerCategory = McpServerCategory.CAPABILITY


class McpServerUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    token: str | None = None
    category: McpServerCategory | None = None
    status: str | None = None
