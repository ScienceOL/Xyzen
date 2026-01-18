from __future__ import annotations

import re
import time
from typing import Any, cast

import httpx

from app.utils.literature.models import LiteratureQuery, WorkAuthor, WorkRecord
from app.utils.literature.providers.base import ProviderResponse


def _short_openalex_id(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    if s.startswith("http://") or s.startswith("https://"):
        return s.rstrip("/").split("/")[-1]
    return s


async def search_sources(
    name: str,
    *,
    base_url: str = "https://api.openalex.org",
    timeout_s: float = 20.0,
    mailto: str | None = None,
    per_page: int = 10,
) -> list[dict[str, Any]]:
    """Lookup OpenAlex Sources by name.

    Returns a compact list of candidate sources with IDs that can be used in works filters,
    e.g. primary_location.source.id:Sxxxx.
    """

    q = (name or "").strip()
    if not q:
        return []

    params: dict[str, Any] = {
        "search": q,
        "per-page": max(1, min(int(per_page), 50)),
        "select": "id,display_name,issn_l,issn,host_organization,type,works_count,cited_by_count",
    }
    if mailto:
        params["mailto"] = mailto

    url = base_url.rstrip("/") + "/sources"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    out: list[dict[str, Any]] = []
    for item in data.get("results") or []:
        if not isinstance(item, dict):
            continue
        sid = _short_openalex_id(item.get("id") if isinstance(item.get("id"), str) else None)
        if not sid:
            continue
        out.append(
            {
                "id": sid,
                "display_name": item.get("display_name"),
                "type": item.get("type"),
                "issn_l": item.get("issn_l"),
                "issn": item.get("issn"),
                "host_organization": _short_openalex_id(
                    item.get("host_organization") if isinstance(item.get("host_organization"), str) else None
                ),
                "works_count": item.get("works_count"),
                "cited_by_count": item.get("cited_by_count"),
            }
        )
    return out


async def search_authors(
    name: str,
    *,
    base_url: str = "https://api.openalex.org",
    timeout_s: float = 20.0,
    mailto: str | None = None,
    per_page: int = 10,
) -> list[dict[str, Any]]:
    """Lookup OpenAlex Authors by name.

    Returns a compact list of candidate authors with IDs that can be used in works filters,
    e.g. authorships.author.id:Axxxx.
    """

    q = (name or "").strip()
    if not q:
        return []

    params: dict[str, Any] = {
        "search": q,
        "per-page": max(1, min(int(per_page), 50)),
        "select": "id,display_name,orcid,works_count,cited_by_count,last_known_institution",
    }
    if mailto:
        params["mailto"] = mailto

    url = base_url.rstrip("/") + "/authors"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    out: list[dict[str, Any]] = []
    for item in data.get("results") or []:
        if not isinstance(item, dict):
            continue
        aid = _short_openalex_id(item.get("id") if isinstance(item.get("id"), str) else None)
        if not aid:
            continue
        inst = item.get("last_known_institution")
        inst_id = None
        inst_name = None
        if isinstance(inst, dict):
            inst_id = _short_openalex_id(inst.get("id") if isinstance(inst.get("id"), str) else None)
            inst_name = inst.get("display_name") if isinstance(inst.get("display_name"), str) else None
        out.append(
            {
                "id": aid,
                "display_name": item.get("display_name"),
                "orcid": item.get("orcid"),
                "works_count": item.get("works_count"),
                "cited_by_count": item.get("cited_by_count"),
                "last_known_institution": {"id": inst_id, "display_name": inst_name} if inst_id or inst_name else None,
            }
        )
    return out


class OpenAlexProvider:
    name = "openalex"

    def __init__(
        self,
        *,
        base_url: str = "https://api.openalex.org",
        timeout_s: float = 20.0,
        mailto: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s
        self._mailto = mailto
        self._user_agent = user_agent

    async def search_works(self, query: LiteratureQuery) -> ProviderResponse:
        provider_params: dict[str, Any] = (query.provider_params.get("openalex") or {}).copy()

        include_referenced_works = bool(provider_params.pop("include_referenced_works", False))
        max_referenced_works = provider_params.pop("max_referenced_works", None)
        max_refs_i: int | None = None
        if isinstance(max_referenced_works, int):
            max_refs_i = max_referenced_works
        elif isinstance(max_referenced_works, str) and max_referenced_works.strip().isdigit():
            try:
                max_refs_i = int(max_referenced_works.strip())
            except Exception:
                max_refs_i = None
        if max_refs_i is not None:
            max_refs_i = max(0, min(max_refs_i, 200))
        per_page = min(max(int(provider_params.pop("per-page", query.limit)), 1), 200)

        params: dict[str, Any] = {
            "per-page": per_page,
            # Default select keeps payload small while still mapping into WorkRecord.
            "select": provider_params.pop(
                "select",
                "id,doi,title,display_name,publication_year,authorships,primary_location,best_oa_location,type,cited_by_count,referenced_works_count",
            ),
        }

        if include_referenced_works:
            # Potentially large; only include when explicitly requested.
            params["select"] = str(params.get("select") or "") + ",referenced_works"

        mailto = provider_params.pop("mailto", self._mailto)
        if mailto:
            params["mailto"] = mailto

        # Build a conservative query: prefer exact DOI filter; otherwise use search.
        filter_parts: list[str] = []
        if query.doi:
            filter_parts.append(f"doi:{_normalize_doi_for_openalex_filter(query.doi)}")

        if query.year_from is not None or query.year_to is not None:
            year_from = query.year_from
            year_to = query.year_to
            if year_from is not None and year_to is not None:
                filter_parts.append(f"publication_year:{year_from}-{year_to}")
            elif year_from is not None:
                filter_parts.append(f"publication_year:>={year_from}")
            elif year_to is not None:
                filter_parts.append(f"publication_year:<={year_to}")

        # If the user provided an explicit OpenAlex filter, respect it.
        if "filter" in provider_params:
            params["filter"] = provider_params.pop("filter")
        elif filter_parts:
            params["filter"] = ",".join(filter_parts)

        if "search" in provider_params:
            params["search"] = provider_params.pop("search")
        else:
            derived_search = _build_openalex_search(query)
            if derived_search:
                params["search"] = derived_search

        # Let caller override/extend everything else (sort, cursor, sample, seed, api_key, etc.).
        params.update(provider_params)

        headers: dict[str, str] = {}
        if self._user_agent:
            headers["User-Agent"] = self._user_agent

        url = f"{self._base_url}/works"
        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=self._timeout_s, headers=headers) as client:
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                summary = _summarize_http_error(exc)
                # Re-raise with a richer message so callers (and the LLM) see why OpenAlex rejected the request.
                raise httpx.HTTPStatusError(summary, request=exc.request, response=exc.response) from exc
            except httpx.RequestError as exc:
                # Surface network/runtime errors with provider context.
                raise httpx.RequestError(f"OpenAlex request error: {exc}", request=exc.request) from exc

            data = resp.json()
        _ = (time.perf_counter() - started) * 1000

        results: list[WorkRecord] = []
        for item in data.get("results", []) or []:
            if isinstance(item, dict):
                results.append(_map_work(cast(dict[str, Any], item), max_referenced_works=max_refs_i))

        raw = cast(dict[str, Any], data) if isinstance(data, dict) else None
        return ProviderResponse(works=results, raw=raw)


_DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$", re.IGNORECASE)


def _normalize_doi_for_openalex_filter(doi: str) -> str:
    """OpenAlex 'doi' filter expects the DOI URL form.

    Docs examples: filter=doi:https://doi.org/10.xxxx/yyy
    """

    doi = doi.strip()
    if not doi:
        return doi
    if doi.lower().startswith("https://doi.org/"):
        return doi
    if doi.lower().startswith("http://doi.org/"):
        return "https://doi.org/" + doi[len("http://doi.org/") :]
    if doi.lower().startswith("doi:"):
        doi = doi[4:].strip()
    if _DOI_RE.match(doi):
        return "https://doi.org/" + doi
    # Fallback: pass through; cleaner will handle later.
    return doi


def _build_openalex_search(query: LiteratureQuery) -> str | None:
    parts: list[str] = []
    if query.query:
        parts.append(query.query)
    # Title and author names are not guaranteed to be searchable as related entities,
    # but using fulltext search is a reasonable best-effort fallback.
    if query.title:
        parts.append(query.title)
    if query.author:
        parts.append(query.author)
    s = " ".join(p.strip() for p in parts if p and p.strip())
    return s or None


def _map_work(item: dict[str, Any], *, max_referenced_works: int | None = None) -> WorkRecord:
    authors: list[WorkAuthor] = []
    for authorship in item.get("authorships", []) or []:
        if not isinstance(authorship, dict):
            continue
        author_obj_unknown = authorship.get("author")
        if not isinstance(author_obj_unknown, dict):
            continue
        author_obj = cast(dict[str, Any], author_obj_unknown)
        name = author_obj.get("display_name")
        if not isinstance(name, str) or not name:
            continue
        authors.append(
            WorkAuthor(
                name=name,
                orcid=cast(str, author_obj.get("orcid")) if isinstance(author_obj.get("orcid"), str) else None,
                source_id=cast(str, author_obj.get("id")) if isinstance(author_obj.get("id"), str) else None,
            )
        )

    year = item.get("publication_year")
    if not isinstance(year, int):
        year = None

    primary_location = item.get("primary_location") if isinstance(item.get("primary_location"), dict) else None
    best_oa_location = item.get("best_oa_location") if isinstance(item.get("best_oa_location"), dict) else None

    venue: str | None = None
    if primary_location and isinstance(primary_location.get("source"), dict):
        venue_val = primary_location["source"].get("display_name")
        if isinstance(venue_val, str) and venue_val:
            venue = venue_val

    journal: str | None = None
    # OpenAlex now prefers primary_location/locations instead of host_venue.
    for loc in (primary_location, best_oa_location):
        if loc and isinstance(loc.get("source"), dict):
            jv = loc["source"].get("display_name") or loc["source"].get("name")
            if isinstance(jv, str) and jv:
                journal = jv
                break
    journal = journal or venue

    url: str | None = None
    for loc in (primary_location, best_oa_location):
        if loc and isinstance(loc.get("landing_page_url"), str) and loc.get("landing_page_url"):
            url = loc["landing_page_url"]
            break

    pdf_url: str | None = None
    for loc in (best_oa_location, primary_location):
        if loc and isinstance(loc.get("pdf_url"), str) and loc.get("pdf_url"):
            pdf_url = loc["pdf_url"]
            break

    title = item.get("title") if isinstance(item.get("title"), str) else None
    if not title:
        title = item.get("display_name") if isinstance(item.get("display_name"), str) else None

    work_type = item.get("type") if isinstance(item.get("type"), str) else None

    cited_by_count = item.get("cited_by_count")
    if not isinstance(cited_by_count, int):
        cited_by_count = None

    referenced_works_count = item.get("referenced_works_count")
    if not isinstance(referenced_works_count, int):
        referenced_works_count = None

    referenced_works: list[str] | None = None
    refs_any = item.get("referenced_works")
    if isinstance(refs_any, list):
        refs: list[str] = [r for r in refs_any if isinstance(r, str) and r]
        if max_referenced_works is not None:
            refs = refs[:max_referenced_works]
        referenced_works = refs

    return WorkRecord(
        source="openalex",
        source_id=item.get("id") if isinstance(item.get("id"), str) else None,
        doi=item.get("doi") if isinstance(item.get("doi"), str) else None,
        title=title,
        authors=authors,
        year=year,
        venue=venue,
        journal=journal,
        work_type=work_type,
        cited_by_count=cited_by_count,
        referenced_works_count=referenced_works_count,
        referenced_works=referenced_works,
        url=url,
        pdf_url=pdf_url,
        raw=item,
    )


def _summarize_http_error(exc: httpx.HTTPStatusError) -> str:
    status = exc.response.status_code
    reason = exc.response.reason_phrase
    url = str(exc.request.url)

    detail: str | None = None
    try:
        payload = exc.response.json()
        if isinstance(payload, dict):
            for key in ("error", "detail", "message", "description"):
                val = payload.get(key)
                if isinstance(val, str) and val.strip():
                    detail = val.strip()
                    break
    except Exception:
        pass

    if not detail:
        text = (exc.response.text or "").strip().replace("\n", " ")
        if text:
            detail = text[:400]

    return f"OpenAlex HTTP {status} {reason}: {detail or 'No error detail'} (url={url})"
