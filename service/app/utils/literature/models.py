from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


SourceName = Literal[
    "openalex",
    "crossref",
    "semanticscholar",
    "pubmed",
    "unknown",
]


class LiteratureQuery(BaseModel):
    """Provider-agnostic literature query.

    Design goals:
    - Keep a stable, generic shape for the MCP tool surface.
    - Allow provider-specific parameter passthrough via `provider_params`.
    """

    model_config = ConfigDict(extra="forbid")

    query: str | None = None
    doi: str | None = None
    title: str | None = None
    author: str | None = None

    year_from: int | None = Field(default=None, ge=0)
    year_to: int | None = Field(default=None, ge=0)

    limit: int = Field(default=20, ge=1, le=500)
    providers: list[str] | None = None

    # Provider-specific passthrough parameters.
    # Example: {"openalex": {"filter": "type:journal-article", "select": "id,doi,title"}}
    provider_params: dict[str, dict[str, Any]] = Field(default_factory=dict)


class WorkAuthor(BaseModel):
    """A minimal author representation."""

    model_config = ConfigDict(extra="forbid")

    name: str
    orcid: str | None = None
    source_id: str | None = None


class WorkRecord(BaseModel):
    """Normalized literature metadata record.

    Providers must map their native payloads into this shape so the aggregator
    and cleaner can work consistently.
    """

    model_config = ConfigDict(extra="forbid")

    source: SourceName = "unknown"
    source_id: str | None = None

    doi: str | None = None
    title: str | None = None

    authors: list[WorkAuthor] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    journal: str | None = None
    work_type: str | None = None
    cited_by_count: int | None = Field(default=None, ge=0)
    referenced_works_count: int | None = Field(default=None, ge=0)
    # Potentially large; providers should only populate when explicitly requested.
    referenced_works: list[str] | None = None

    url: str | None = None
    pdf_url: str | None = None

    # Keep the original provider response to support debugging and future
    # feature expansion.
    raw: dict[str, Any] | None = None


class ProviderError(BaseModel):
    model_config = ConfigDict(extra="allow")

    provider: str
    message: str
    status_code: int | None = None
    error_code: str | None = None
    retryable: bool | None = None


class ProviderStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str
    requests: int = 0
    fetched: int = 0
    took_ms: int | None = None


class LiteratureResult(BaseModel):
    """Standard tool response envelope."""

    model_config = ConfigDict(extra="allow")

    success: bool = True
    results: list[WorkRecord] = Field(default_factory=list)
    errors: list[ProviderError] = Field(default_factory=list)
    stats: dict[str, ProviderStats] = Field(default_factory=dict)

    # Free-form metadata for debugging/traceability.
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
