import datetime as dt
from typing import Any, Dict, Optional

from sqlmodel import JSON, Column, Field, SQLModel


def _utcnow_naive() -> dt.datetime:
    """Return current UTC time as a naive datetime (no tzinfo).

    Use timezone-aware now() then strip tzinfo to match TIMESTAMP WITHOUT TIME ZONE columns.
    """
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class SmitheryServersCache(SQLModel, table=True):
    """
    Cache table for Smithery servers list responses keyed by normalized query params.

    Key format: a deterministic hashable string based on path ('servers') and sorted query params.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    # Unique cache key for a given query (e.g., servers?q=...&profile=...&page=...&pageSize=...)
    key: str = Field(index=True, unique=True)

    # Original params used to build the key (for debugging/inspection)
    params: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

    # Raw JSON payload returned by Smithery Registry
    data: Dict[str, Any] = Field(sa_column=Column(JSON))

    # Expiration timestamp (UTC)
    # Store naive UTC to avoid tz mismatch across drivers
    expires_at: dt.datetime = Field(index=True)

    # Book-keeping
    created_at: dt.datetime = Field(default_factory=_utcnow_naive, index=True)
    updated_at: dt.datetime = Field(default_factory=_utcnow_naive, index=True)
    hits: int = Field(default=0)
