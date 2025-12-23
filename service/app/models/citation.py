from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import JSON, TIMESTAMP
from sqlmodel import Column, Field, SQLModel


class CitationBase(SQLModel):
    """Base model for search citations"""

    message_id: UUID = Field(index=True)
    url: str
    title: str | None = None
    cited_text: str | None = None
    start_index: int | None = None
    end_index: int | None = None
    search_queries: list[str] | None = Field(default=None, sa_column=Column(JSON))


class Citation(CitationBase, table=True):
    """Database model for search citations"""

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False),
    )


class CitationCreate(CitationBase):
    """Model for creating a citation"""

    pass


class CitationRead(CitationBase):
    """Model for reading a citation"""

    id: UUID
    created_at: datetime
