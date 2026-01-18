from __future__ import annotations

from dataclasses import dataclass
import re
import time
from typing import Any, cast

import httpx

from app.utils.literature.models import LiteratureQuery, WorkAuthor, WorkRecord
from app.utils.literature.providers.base import ProviderResponse


@dataclass(slots=True)
class OpenAlexRetryInstruction:
    """Instruction for the caller to retry with more precise inputs.

    This is intentionally transport-agnostic (MCP/tool wrappers can decide how
    to format the final response envelope).
    """

    message: str
    warnings: list[str]
    extra_meta: dict[str, Any]


@dataclass(slots=True)
class OpenAlexPrecisionResult:
    """Outcome of OpenAlex parameter preparation for a works search."""

    openalex_params: dict[str, Any]
    journal_source_ids: list[str] | None
    author_ids: list[str] | None
    precision_warnings: list[str]
    precision_meta: dict[str, Any]
    retry: OpenAlexRetryInstruction | None


def _short_openalex_id(value: str | None) -> str | None:
    if not value:
        return None
    s = value.strip()
    if not s:
        return None
    if s.startswith("http://") or s.startswith("https://"):
        return s.rstrip("/").split("/")[-1]
    return s


_OPENALEX_ID_RE = re.compile(r"^[A-Za-z]\d+$")
_ISSN_RE = re.compile(r"^\d{4}-\d{3}[\dXx]$")
_ISSN_COMPACT_RE = re.compile(r"^\d{8}$")
_ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$")


def normalize_openalex_provider_params(
    provider_params: dict[str, Any] | None,
    *,
    mailto: str | None,
    default_mailto: str | None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Normalize MCP-level provider params into a LiteratureQuery provider map.

    Accepts two shapes:
    1) Direct OpenAlex params (auto-wrapped): {"filter": "...", "sort": "..."}
    2) Explicit provider map: {"openalex": {...}}

    Returns: (normalized_provider_params, openalex_params_reference)
    """

    normalized_provider_params: dict[str, dict[str, Any]] = {}
    if provider_params:
        if isinstance(provider_params.get("openalex"), dict):
            normalized_provider_params = {"openalex": cast(dict[str, Any], provider_params["openalex"])}
        else:
            normalized_provider_params = {"openalex": provider_params}

    openalex_params = normalized_provider_params.setdefault("openalex", {})

    # Ensure OpenAlex gets a `mailto` value (caller-provided wins).
    if mailto:
        openalex_params["mailto"] = mailto
    elif default_mailto and "mailto" not in openalex_params:
        openalex_params["mailto"] = default_mailto

    return normalized_provider_params, openalex_params


def _normalize_issn(value: str) -> str | None:
    s = value.strip()
    if not s:
        return None
    if _ISSN_RE.match(s):
        return s.upper()
    if _ISSN_COMPACT_RE.match(s):
        return (s[:4] + "-" + s[4:]).upper()
    return None


def _normalize_orcid_to_url(value: str) -> str | None:
    s = value.strip()
    if not s:
        return None
    s2 = s
    if s2.startswith("http://orcid.org/"):
        s2 = "https://orcid.org/" + s2[len("http://orcid.org/") :]
    if s2.startswith("https://orcid.org/"):
        tail = s2[len("https://orcid.org/") :]
        if _ORCID_RE.match(tail):
            return "https://orcid.org/" + tail.upper()
        return None
    if _ORCID_RE.match(s2):
        return "https://orcid.org/" + s2.upper()
    return None


def _normalize_openalex_filter_values(
    values: list[str] | None,
    *,
    max_values: int = 100,
) -> tuple[list[str], list[str]]:
    """Sanitize values so we don't generate invalid OpenAlex filter strings."""

    if not values:
        return [], []
    out: list[str] = []
    warnings: list[str] = []
    for raw in values:
        s = raw.strip()
        if not s:
            continue
        if any(ch in s for ch in [",", "|", "+"]):
            warnings.append(f"Dropped filter value containing reserved separator: {raw!r}")
            continue
        if any(c.isspace() for c in s):
            warnings.append(f"Dropped filter value containing whitespace: {raw!r}")
            continue
        out.append(s)

    if len(out) > max_values:
        warnings.append(f"Too many values for a single filter; truncated to {max_values}")
        out = out[:max_values]
    return out, warnings


def _normalize_journal_targets(values: list[str] | None) -> tuple[list[str], list[str], list[str]]:
    """Split journal targets into (source_ids, issns, warnings)."""

    values2, warnings = _normalize_openalex_filter_values(values)
    source_ids: list[str] = []
    issns: list[str] = []
    for v in values2:
        sid = _short_openalex_id(v)
        if sid and _OPENALEX_ID_RE.match(sid) and sid.upper().startswith("S"):
            source_ids.append(sid.upper())
            continue
        issn = _normalize_issn(v)
        if issn:
            issns.append(issn)
            continue
        warnings.append(f"Unrecognized journal identifier; expected Source ID (S...) or ISSN: {v!r}")

    def dedupe(seq: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for x in seq:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    return dedupe(source_ids), dedupe(issns), warnings


def _normalize_author_targets(values: list[str] | None) -> tuple[list[str], list[str], list[str]]:
    """Split author targets into (author_ids, orcid_urls, warnings)."""

    values2, warnings = _normalize_openalex_filter_values(values)
    author_ids: list[str] = []
    orcids: list[str] = []
    for v in values2:
        aid = _short_openalex_id(v)
        if aid and _OPENALEX_ID_RE.match(aid) and aid.upper().startswith("A"):
            author_ids.append(aid.upper())
            continue
        orcid_url = _normalize_orcid_to_url(v)
        if orcid_url:
            orcids.append(orcid_url)
            continue
        warnings.append(f"Unrecognized author identifier; expected Author ID (A...) or ORCID: {v!r}")

    def dedupe(seq: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for x in seq:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    return dedupe(author_ids), dedupe(orcids), warnings


async def prepare_openalex_precision(
    *,
    query: str | None,
    title: str | None,
    author: str | None,
    journal_names: list[str] | None,
    journal_source_ids: list[str] | None,
    author_ids: list[str] | None,
    openalex_params: dict[str, Any],
    mailto_effective: str | None,
    call_attempt: int,
    max_call_attempts: int,
    sort_by_cited_by_count: bool,
) -> OpenAlexPrecisionResult:
    """Apply OpenAlex-specific precision logic (journal/author filters) and best-effort fallback.

    - If journal/author names are provided without IDs, performs lookup and can request a retry
      (to force exact ID-based filtering) unless it's the last attempt.
    - Normalizes IDs (S.../ISSN, A.../ORCID) and safely appends filters to OpenAlex params.
    - On the last attempt only, falls back to adding journal name hints into fulltext search.
    """

    precision_meta: dict[str, Any] = {}
    precision_warnings: list[str] = []
    is_last_attempt = call_attempt >= max_call_attempts

    resolved_journal_ids: list[str] = []
    journal_candidates_by_name: dict[str, Any] = {}
    if journal_names and not journal_source_ids:
        for jn in journal_names:
            cands = await search_sources(jn, mailto=mailto_effective, per_page=10)
            journal_candidates_by_name[jn] = cands
            exact = [
                c
                for c in cands
                if isinstance(c.get("display_name"), str) and c["display_name"].strip().lower() == jn.strip().lower()
            ]
            if len(exact) == 1 and isinstance(exact[0].get("id"), str):
                resolved_journal_ids.append(exact[0]["id"])
            elif len(cands) == 1 and isinstance(cands[0].get("id"), str):
                resolved_journal_ids.append(cands[0]["id"])
        precision_meta["journal_candidates"] = journal_candidates_by_name
        precision_warnings.append("journal name lookup performed; use journal_source_id for exact filtering")

    resolved_author_ids: list[str] = []
    author_candidates_by_name: dict[str, Any] = {}
    if author and not author_ids:
        cands = await search_authors(author, mailto=mailto_effective, per_page=10)
        author_candidates_by_name[author] = cands
        exact = [
            c
            for c in cands
            if isinstance(c.get("display_name"), str) and c["display_name"].strip().lower() == author.strip().lower()
        ]
        if len(exact) == 1 and isinstance(exact[0].get("id"), str):
            resolved_author_ids.append(exact[0]["id"])
        elif len(cands) == 1 and isinstance(cands[0].get("id"), str):
            resolved_author_ids.append(cands[0]["id"])
        precision_meta["author_candidates"] = author_candidates_by_name
        precision_warnings.append("author name lookup performed; use author_id for exact filtering")

    journal_ambiguous = bool(
        journal_names
        and not journal_source_ids
        and ((not resolved_journal_ids) or (resolved_journal_ids and len(resolved_journal_ids) != len(journal_names)))
    )
    author_ambiguous = bool(author and not author_ids and not resolved_author_ids)

    if (journal_ambiguous or author_ambiguous) and not is_last_attempt:
        # Ask caller to retry with explicit IDs.
        return OpenAlexPrecisionResult(
            openalex_params=openalex_params,
            journal_source_ids=resolved_journal_ids or None,
            author_ids=resolved_author_ids or None,
            precision_warnings=precision_warnings
            or ["name lookup performed; retry with explicit IDs for exact filtering"],
            precision_meta=precision_meta,
            retry=OpenAlexRetryInstruction(
                message="Journal/author names are ambiguous in OpenAlex. Please retry with explicit journal_source_id and/or author_id.",
                warnings=precision_warnings or ["name lookup performed; retry with explicit IDs for exact filtering"],
                extra_meta={
                    **precision_meta,
                    "call_attempt": call_attempt,
                    "max_call_attempts": max_call_attempts,
                },
            ),
        )

    # If we resolved IDs confidently from names, apply them as if caller provided them.
    if resolved_journal_ids and not journal_source_ids:
        journal_source_ids = resolved_journal_ids
    if resolved_author_ids and not author_ids:
        author_ids = resolved_author_ids

    # Fuzzy fallback (best-effort) ONLY on the last attempt.
    if is_last_attempt and journal_names and not journal_source_ids:
        base_parts = [p for p in [query, title, author] if isinstance(p, str) and p.strip()]
        base_search = openalex_params.get("search") if isinstance(openalex_params.get("search"), str) else None
        if not base_search:
            base_search = " ".join(base_parts)
        journal_hint = " ".join(journal_names)
        combined = (base_search + " " + journal_hint).strip() if base_search else journal_hint
        if combined:
            openalex_params["search"] = combined

    if journal_source_ids:
        normalized_source_ids, normalized_issns, normalize_warnings = _normalize_journal_targets(journal_source_ids)
        if normalize_warnings:
            precision_warnings.extend(normalize_warnings)

        if not normalized_source_ids and not normalized_issns:
            return OpenAlexPrecisionResult(
                openalex_params=openalex_params,
                journal_source_ids=None,
                author_ids=author_ids,
                precision_warnings=precision_warnings,
                precision_meta=precision_meta,
                retry=OpenAlexRetryInstruction(
                    message=(
                        "Invalid journal_source_id values. Provide OpenAlex Source IDs like 'S2764455111' or ISSN like '1476-4687'."
                    ),
                    warnings=precision_warnings
                    or [
                        "journal_source_id must be an OpenAlex Source ID (S...) or ISSN (####-####)",
                        "retry with corrected IDs",
                    ],
                    extra_meta={
                        **precision_meta,
                        "call_attempt": call_attempt,
                        "max_call_attempts": max_call_attempts,
                        "journal_source_id_expected": ["S<digits>", "ISSN ####-####"],
                    },
                ),
            )

        journal_filter: str | None
        if normalized_source_ids:
            journal_filter = "primary_location.source.id:" + "|".join(normalized_source_ids)
        elif normalized_issns:
            journal_filter = "primary_location.source.issn:" + "|".join(normalized_issns)
        else:
            journal_filter = None

        if journal_filter:
            if isinstance(openalex_params.get("filter"), str) and str(openalex_params.get("filter")).strip():
                openalex_params["filter"] = f"{openalex_params['filter']},{journal_filter}"
            else:
                openalex_params["filter"] = journal_filter

        journal_source_ids = normalized_source_ids or normalized_issns

    if author_ids:
        normalized_author_ids, normalized_orcids, normalize_warnings = _normalize_author_targets(author_ids)
        if normalize_warnings:
            precision_warnings.extend(normalize_warnings)

        if not normalized_author_ids and not normalized_orcids:
            return OpenAlexPrecisionResult(
                openalex_params=openalex_params,
                journal_source_ids=journal_source_ids,
                author_ids=None,
                precision_warnings=precision_warnings,
                precision_meta=precision_meta,
                retry=OpenAlexRetryInstruction(
                    message=(
                        "Invalid author_id values. Provide OpenAlex Author IDs like 'A5023888391' or ORCID like '0000-0003-1613-5981'."
                    ),
                    warnings=precision_warnings
                    or ["author_id must be an OpenAlex Author ID (A...) or ORCID", "retry with corrected IDs"],
                    extra_meta={
                        **precision_meta,
                        "call_attempt": call_attempt,
                        "max_call_attempts": max_call_attempts,
                        "author_id_expected": ["A<digits>", "ORCID ####-####-####-####"],
                    },
                ),
            )

        author_filter: str | None
        if normalized_author_ids:
            author_filter = "authorships.author.id:" + "|".join(normalized_author_ids)
        elif normalized_orcids:
            author_filter = "authorships.author.orcid:" + "|".join(normalized_orcids)
        else:
            author_filter = None

        if author_filter:
            if isinstance(openalex_params.get("filter"), str) and str(openalex_params.get("filter")).strip():
                openalex_params["filter"] = f"{openalex_params['filter']},{author_filter}"
            else:
                openalex_params["filter"] = author_filter

        author_ids = normalized_author_ids or normalized_orcids

    if sort_by_cited_by_count:
        openalex_params.setdefault("sort", "cited_by_count:desc")

    if precision_warnings:
        precision_meta.setdefault("call_attempt", call_attempt)
        precision_meta.setdefault("max_call_attempts", max_call_attempts)

    return OpenAlexPrecisionResult(
        openalex_params=openalex_params,
        journal_source_ids=journal_source_ids,
        author_ids=author_ids,
        precision_warnings=precision_warnings,
        precision_meta=precision_meta,
        retry=None,
    )


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

        item2 = cast(dict[str, Any], item)
        item_id = item2.get("id")
        sid = _short_openalex_id(item_id if isinstance(item_id, str) else None)
        if not sid:
            continue
        out.append(
            {
                "id": sid,
                "display_name": item2.get("display_name"),
                "type": item2.get("type"),
                "issn_l": item2.get("issn_l"),
                "issn": item2.get("issn"),
                "host_organization": _short_openalex_id(
                    item2.get("host_organization") if isinstance(item2.get("host_organization"), str) else None
                ),
                "works_count": item2.get("works_count"),
                "cited_by_count": item2.get("cited_by_count"),
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

        item2 = cast(dict[str, Any], item)
        item_id = item2.get("id")
        aid = _short_openalex_id(item_id if isinstance(item_id, str) else None)
        if not aid:
            continue

        inst = item2.get("last_known_institution")
        inst_id = None
        inst_name = None
        if isinstance(inst, dict):
            inst2 = cast(dict[str, Any], inst)
            inst2_id = inst2.get("id")
            inst_id = _short_openalex_id(inst2_id if isinstance(inst2_id, str) else None)
            inst_name = inst2.get("display_name") if isinstance(inst2.get("display_name"), str) else None
        out.append(
            {
                "id": aid,
                "display_name": item2.get("display_name"),
                "orcid": item2.get("orcid"),
                "works_count": item2.get("works_count"),
                "cited_by_count": item2.get("cited_by_count"),
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
