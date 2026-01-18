from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.utils.literature.models import LiteratureQuery, WorkRecord


@dataclass(frozen=True, slots=True)
class ProviderResponse:
    works: list[WorkRecord]
    raw: dict[str, Any] | None = None


class LiteratureProvider(Protocol):
    """A literature metadata source.

    Providers should be pure data fetchers: map source payloads into WorkRecord.
    Cleaning (DOI normalization, dedup) is handled elsewhere.
    """

    name: str

    async def search_works(self, query: LiteratureQuery) -> ProviderResponse: ...
