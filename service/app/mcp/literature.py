"""MCP Server for Literature / Bibliography fetching.

This module is intentionally minimal at first: it provides tool entry points and
will be progressively wired to providers (OpenAlex first) under
`app.utils.literature`.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Mapping
from typing import Any, cast
from uuid import UUID


from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import get_access_token

from app.utils.literature.aggregator import fetch_works as agg_fetch_works
from app.utils.literature.models import LiteratureQuery
from app.middleware.auth import AuthProvider
from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier
from app.utils.literature.exporter import (
    derive_xlsx_filename,
    build_xlsx_bytes,
    persist_xlsx,
)
from app.utils.literature.providers.openalex import (
    search_sources as openalex_search_sources,
    search_authors as openalex_search_authors,
)


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
            try:
                return int(s)
            except Exception:
                return None
    return None


def _coerce_str_list(value: Any) -> list[str] | None:
    if value is None:
        return None

    def normalize_one(s: str) -> list[str]:
        ss = s.strip()
        if not ss:
            return []
        # Unwrap JSON stringified list: '["openalex"]'
        if ss.startswith("[") and ss.endswith("]"):
            try:
                obj = json.loads(ss)
            except Exception:
                obj = None
            if isinstance(obj, list):
                out2: list[str] = []
                for item in obj:
                    if isinstance(item, str) and item.strip():
                        out2.append(item.strip())
                return out2
        # Accept both comma-separated and single key.
        parts = [p.strip() for p in ss.split(",")]
        return [p for p in parts if p]

    if isinstance(value, list):
        out: list[str] = []
        for v in value:
            if isinstance(v, str):
                out.extend(normalize_one(v))
        return out or None
    if isinstance(value, str):
        out = normalize_one(value)
        return out or None
    return None


def _coerce_dict(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        # Allow JSON dict passed as a string.
        try:
            obj = json.loads(s)
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None
    return None


def _coerce_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        s = value.strip().lower()
        if s in {"true", "1", "yes", "y", "on"}:
            return True
        if s in {"false", "0", "no", "n", "off"}:
            return False
    return None


def _build_retry_response(
    *,
    message: str,
    suggested_args: dict[str, Any],
    warnings: list[str],
    extra_meta: dict[str, Any] | None = None,
    errors: list[dict[str, Any]] | None = None,
    stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # Shape matches LiteratureResult-like envelope (extra fields allowed).
    meta: dict[str, Any] = {
        "needs_retry": True,
        "warnings": warnings,
        "suggested_call": {"tool": "fetch_works", "args": suggested_args},
    }
    if extra_meta:
        meta.update(extra_meta)

    # Strong guidance for LLM tool-calling loops.
    # - On `needs_retry`, only retry once with the suggested args.
    # - On success responses, the tool will explicitly say not to re-call.
    call_attempt = meta.get("call_attempt")
    max_call_attempts = meta.get("max_call_attempts")
    try:
        attempt_i = int(call_attempt) if call_attempt is not None else None
    except Exception:
        attempt_i = None
    try:
        max_i = int(max_call_attempts) if max_call_attempts is not None else None
    except Exception:
        max_i = None
    max_note = f" (max {max_i})" if max_i else ""
    summary_note = (
        "本次请求未成功完成/需要重试：请只按 meta.suggested_call 进行下一次调用（不要反复尝试不同参数）。"
        "如果仍失败，可继续重试直到成功，但请限制次数；只有用户明确提出再次检索/换条件检索时才进行新的查询。"
        + (f" 当前尝试次数: {attempt_i}{max_note}." if attempt_i else "")
        + " (EN: Retry needed. Re-call ONLY once using meta.suggested_call; avoid repeated/variant calls. If still failing, retry up to the limit; only start a new search if the user explicitly requests it.)"
    )

    return {
        "success": False,
        "results": [],
        "errors": errors
        if errors is not None
        else [
            {
                "provider": "mcp",
                "message": message,
                "error_code": "invalid_params",
                "retryable": True,
            }
        ],
        "stats": stats or {},
        "meta": meta,
        "summary": {"note": summary_note},
    }


def _extract_knowledge_set_id(extra: dict[str, Any] | None, claims: dict[str, Any]) -> UUID | None:
    candidates: list[Any] = []
    if extra:
        candidates.extend(
            [
                extra.get("knowledge_set_id"),
                extra.get("knowledgeSetId"),
                extra.get("knowledge_setId"),
            ]
        )
    candidates.extend(
        [
            claims.get("knowledge_set_id"),
            claims.get("knowledgeSetId"),
            claims.get("knowledge_setId"),
        ]
    )
    for c in candidates:
        if not c:
            continue
        try:
            return UUID(str(c))
        except Exception:
            continue
    return None


def _coerce_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except Exception:
        return None


def _coerce_user_id(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s or None
    # Some callers may pass UUID-like values.
    try:
        s2 = str(value).strip()
        return s2 or None
    except Exception:
        return None


logger = logging.getLogger(__name__)


# NOTE: OpenAlex politely requests a contact email via the `mailto` query param.
# This default must NOT be exposed to the LLM/tool schema, so it is applied only
# when the caller does not provide one.
_DEFAULT_OPENALEX_MAILTO = "mengjunxing@shu.edu.cn"


__mcp_metadata__ = {
    "source": "official",
    "description": "Fetch and clean literature metadata from multiple sources (OpenAlex first)",
    "banner": None,
}


literature_mcp: FastMCP = FastMCP(name="Literature 📚", version="0.1.0")


def _build_preview_results(
    results: Iterable[Mapping[str, Any]] | None,
    *,
    max_items: int = 5,
    strip_fields: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Build a small, display-friendly preview list for LLM responses.

    We intentionally strip large/debug fields (e.g. `raw`, `referenced_works`) to
    avoid context explosion in multi-call tool loops.
    """
    if max_items <= 0:
        return []
    if not results:
        return []
    strip_fields = strip_fields or {"raw", "referenced_works"}
    preview: list[dict[str, Any]] = []
    for idx, w in enumerate(results):
        if idx >= max_items:
            break
        item = {k: v for k, v in w.items() if k not in strip_fields}
        preview.append(item)
    return preview


# --- Authentication Configuration (matches other MCP servers in this directory) ---
auth: TokenVerifier

match AuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(public_key=AuthProvider.public_key)
    case "casdoor":
        auth = JWTVerifier(jwks_uri=AuthProvider.jwks_uri)
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=AuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {AuthProvider.get_provider_name()}")


@literature_mcp.tool
async def fetch_works(
    query: str | None = None,
    doi: str | None = None,
    title: str | None = None,
    author: str | None = None,
    author_id: Any = None,
    year_from: Any = None,
    year_to: Any = None,
    limit: Any = 20,
    sort_by_cited_by_count: Any = False,
    journal: Any = None,
    journal_source_id: Any = None,
    knowledge_set_id: Any = None,
    user_id: Any = None,
    mailto: str | None = None,
    providers: Any = None,
    provider_params: Any = None,
    cleaner_params: Any = None,
    call_attempt: Any = 1,
    max_call_attempts: Any = 3,
) -> dict[str, Any]:
    """Fetch literature works metadata (papers/books/etc.) and return cleaned results.

    This tool is designed for LLM use. It supports strict/precise calls and also a
    "normalize-then-retry" workflow when inputs are not in the expected format.

    **Pipeline**
    - Build a unified `LiteratureQuery`
    - Query one or more providers (OpenAlex first)
    - Clean results before returning (DOI normalization + de-duplication by default)

    **Core parameters**
    - `query`: Free-text search.
    - `doi`: DOI to match. Accepts forms like `10.xxxx/...`, `doi:10.xxxx/...`, or a DOI URL.
    - `title` / `author`: Optional structured hints.
    - `year_from` / `year_to`: Optional year range filter.
    - `limit`: Max works to fetch (1..500). Used for request size and optional post-truncation.

    **Sorting**
    - `sort_by_cited_by_count`: If true, sorts by citations (descending) and truncates results to `limit`.
      Also sets OpenAlex `sort=cited_by_count:desc` unless you already set a provider sort.

    **Exact journal targeting (recommended for “Nature/Science/IEEE TMI” requests)**
    OpenAlex cannot reliably filter by journal *name* directly. Use the two-step ID pattern:
    - Preferred: `journal_source_id`: OpenAlex Source IDs like `S2764455111`.
      The tool will filter works using `primary_location.source.id:Sxxxx` (OR supported via `|`).
    - Convenience: `journal`: One or more journal names. If provided *without* `journal_source_id`,
      the tool performs a lookup against `/sources` and returns a **retryable** response that includes
      candidate Source IDs in `meta.journal_candidates`, plus a suggested second call.

        **Exact author targeting (recommended for “papers by <person>” requests)**
        OpenAlex cannot reliably filter by author *name* directly. Use the two-step ID pattern:
        - Preferred: `author_id`: OpenAlex Author IDs like `A1234567890`.
            The tool will filter works using `authorships.author.id:Axxxx` (OR supported via `|`).
        - Convenience: `author`: If provided *without* `author_id`, the tool performs a lookup
            against `/authors` and returns candidate Author IDs in `meta.author_candidates`, plus
            a suggested second call.

    **Providers**
    - `providers`: Provider keys to use.
      - Standard format: lower-case provider key strings, e.g. `providers=["openalex"]`.
      - Current supported values: `openalex`.
      - If you pass an unsupported key, the tool will fail with an error that includes the supported provider list.
      - If omitted, defaults to `openalex`.

    **OpenAlex polite pool**
    - `mailto`: Optional contact email used for OpenAlex polite requests. If omitted, a
      server-side default is applied (not exposed via tool defaults).

    **Knowledge Base persistence (XLSX)**
    - `knowledge_set_id`: Optional UUID of the Knowledge Set to save the full results XLSX into.
      Recommended: pass this explicitly (the Xyzen agent runtime can inject it).
      If omitted, the server will try to infer it from token claims, which may be unavailable.
    - `user_id`: Optional user id for access control. Recommended to pass explicitly (agent runtime can inject it).
      If omitted, the server will try to infer it from the request token, which may not represent the end user.

    **provider_params**
    Provider-specific raw params. Two supported shapes:
    1) Direct OpenAlex params (auto-wrapped):
       `{ "filter": "publication_year:2024", "sort": "cited_by_count:desc" }`
    2) Explicit provider map (keys must match `providers`):
       `{ "openalex": { "filter": "...", "cursor": "*" } }`

    OpenAlex extras supported via `provider_params.openalex`:
    - `filter`, `search`, `sort`, `cursor`, `sample`, `seed`, `per-page`, `select`, etc.
    - `include_referenced_works`: boolean. If true, includes `referenced_works` IDs in each record (can be large).
    - `max_referenced_works`: int 0..200. Truncates `referenced_works` list to control payload size.

    **cleaner_params**
    Cleaner configuration. If `cleaner_params["callable"]` is set, it should be a dotted-path callable
    like `package.module:function` and will override the default cleaner. Any other keys are forwarded
    as kwargs.

    **Normalize-then-retry behavior**
    If any of these require coercion/clamping/dropping (e.g. `limit` is a string, years invalid,
    `provider_params` is JSON string), the tool will NOT execute the search. Instead it returns:
    - `meta.needs_retry = true`
    - `meta.warnings = [...]`
    - `meta.suggested_call = { tool: "fetch_works", args: { ...normalized... } }`

    **Return shape**
    A JSON dict compatible with `LiteratureResult`, typically including:
    - `success`: bool
    - `results`: list of WorkRecord objects (includes `doi`, `title`, `authors`, `year`, `journal`,
      `work_type`, `cited_by_count`, `referenced_works_count`, plus optional `referenced_works` and `raw`)
    - `errors`: list of provider/cleaner errors (if any)
    - `stats` / `meta`: provider timing/counts and execution metadata
    """
    # --- Input coercion/validation gate ---
    # Policy: if we need to coerce/clamp/drop anything, we DO NOT execute search.
    # Instead, we return a retryable response that tells the LLM exactly how to re-call.
    warnings: list[str] = []

    call_attempt_i = _coerce_int(call_attempt) or 1
    max_call_attempts_i = _coerce_int(max_call_attempts) or 3
    if call_attempt_i < 1:
        call_attempt_i = 1
    if max_call_attempts_i < 1:
        max_call_attempts_i = 1
    if max_call_attempts_i > 10:
        max_call_attempts_i = 10
    if call_attempt_i > max_call_attempts_i:
        call_attempt_i = max_call_attempts_i

    limit_i = _coerce_int(limit)
    if limit_i is None:
        warnings.append("limit is not an int; using default 20")
        limit_i = 20
    if limit_i < 1 or limit_i > 500:
        clamped = min(max(limit_i, 1), 500)
        warnings.append(f"limit out of range (1..500); clamped to {clamped}")
        limit_i = clamped

    year_from_i = _coerce_int(year_from)
    year_to_i = _coerce_int(year_to)
    if year_from is not None and year_from_i is None:
        warnings.append("year_from is not an int; dropping")
    if year_to is not None and year_to_i is None:
        warnings.append("year_to is not an int; dropping")
    if year_from_i is not None and year_from_i < 0:
        warnings.append("year_from < 0; dropping")
        year_from_i = None
    if year_to_i is not None and year_to_i < 0:
        warnings.append("year_to < 0; dropping")
        year_to_i = None
    if year_from_i is not None and year_to_i is not None and year_from_i > year_to_i:
        warnings.append("year_from > year_to; swapping")
        year_from_i, year_to_i = year_to_i, year_from_i

    sort_by_cited_by_count_b = _coerce_bool(sort_by_cited_by_count)
    if sort_by_cited_by_count is not None and sort_by_cited_by_count_b is None:
        warnings.append("sort_by_cited_by_count is not a bool; dropping")
        sort_by_cited_by_count_b = False

    providers_l = _coerce_str_list(providers)
    if providers is not None and providers_l is None:
        warnings.append("providers is not a list[str]; dropping")

    provider_params_d = _coerce_dict(provider_params)
    if provider_params is not None and provider_params_d is None:
        warnings.append("provider_params is not a dict (or JSON dict string); dropping")

    cleaner_params_d = _coerce_dict(cleaner_params)
    if cleaner_params is not None and cleaner_params_d is None:
        warnings.append("cleaner_params is not a dict (or JSON dict string); dropping")

    journal_names = _coerce_str_list(journal)
    if journal is not None and journal_names is None:
        warnings.append("journal is not a string/list[str]; dropping")

    journal_source_ids = _coerce_str_list(journal_source_id)
    if journal_source_id is not None and journal_source_ids is None:
        warnings.append("journal_source_id is not a string/list[str]; dropping")

    author_ids = _coerce_str_list(author_id)
    if author_id is not None and author_ids is None:
        warnings.append("author_id is not a string/list[str]; dropping")

    knowledge_set_uuid = _coerce_uuid(knowledge_set_id)
    if knowledge_set_id is not None and knowledge_set_uuid is None:
        warnings.append("knowledge_set_id is not a valid UUID; dropping")

    user_id_s = _coerce_user_id(user_id)
    if user_id is not None and user_id_s is None:
        warnings.append("user_id is not a valid string; dropping")

    # If any coercion/clamp/drop happened, ask LLM to retry with normalized args.
    # (This keeps the next call precise and reproducible.)
    if warnings:
        suggested_args: dict[str, Any] = {
            "query": query,
            "doi": doi,
            "title": title,
            "author": author,
            "author_id": author_ids,
            "year_from": year_from_i,
            "year_to": year_to_i,
            "limit": limit_i,
            "sort_by_cited_by_count": sort_by_cited_by_count_b,
            "journal": journal_names,
            "journal_source_id": journal_source_ids,
            "knowledge_set_id": str(knowledge_set_uuid) if knowledge_set_uuid else None,
            "user_id": user_id_s,
            "mailto": mailto,
            "providers": providers_l,
            "provider_params": provider_params_d,
            "cleaner_params": cleaner_params_d,
            "call_attempt": call_attempt_i,
            "max_call_attempts": max_call_attempts_i,
        }
        # Remove explicit nulls to keep the suggestion compact.
        suggested_args = {k: v for k, v in suggested_args.items() if v is not None}
        return _build_retry_response(
            message="Some parameters were not in the expected format/range. Please re-call fetch_works with the suggested normalized args.",
            suggested_args=suggested_args,
            warnings=warnings,
            extra_meta={"call_attempt": call_attempt_i, "max_call_attempts": max_call_attempts_i},
        )

    # Normalize provider params:
    # - If caller passes OpenAlex raw params directly, wrap into {"openalex": {...}}
    # - If caller passes {"openalex": {...}}, keep as-is.
    normalized_provider_params: dict[str, dict[str, Any]] = {}
    if provider_params_d:
        if isinstance(provider_params_d.get("openalex"), dict):
            normalized_provider_params = {"openalex": provider_params_d["openalex"]}
        else:
            normalized_provider_params = {"openalex": provider_params_d}

    # Ensure OpenAlex gets a `mailto` value (caller-provided wins).
    openalex_params = normalized_provider_params.setdefault("openalex", {})
    if mailto:
        openalex_params["mailto"] = mailto
    elif "mailto" not in openalex_params:
        openalex_params["mailto"] = _DEFAULT_OPENALEX_MAILTO

    # Journal / Author targeting:
    # - Preferred: explicit IDs (journal_source_id, author_id)
    # - Convenience: name lookup (two-step)
    # - Fuzzy fallback: ONLY when call_attempt == max_call_attempts
    mailto_effective: str | None = mailto
    if mailto_effective is None:
        mv = openalex_params.get("mailto")
        mailto_effective = mv if isinstance(mv, str) else None

    precision_meta: dict[str, Any] = {}
    precision_warnings: list[str] = []
    is_last_attempt = call_attempt_i >= max_call_attempts_i

    resolved_journal_ids: list[str] = []
    journal_candidates_by_name: dict[str, Any] = {}
    if journal_names and not journal_source_ids:
        for jn in journal_names:
            cands = await openalex_search_sources(jn, mailto=mailto_effective, per_page=10)
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
        cands = await openalex_search_authors(author, mailto=mailto_effective, per_page=10)
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

    # Decide whether we must stop and ask for a precise retry.
    journal_ambiguous = bool(
        journal_names
        and not journal_source_id
        and ((not resolved_journal_ids) or (resolved_journal_ids and len(resolved_journal_ids) != len(journal_names)))
    )
    author_ambiguous = bool(author and not author_id and not resolved_author_ids)

    # If not last attempt, do not run a fuzzy works search.
    # Return candidates and ask caller to retry with explicit IDs.
    if (journal_ambiguous or author_ambiguous) and not is_last_attempt:
        suggested_args: dict[str, Any] = {
            "query": query,
            "doi": doi,
            "title": title,
            "author": author,
            "author_id": resolved_author_ids or None,
            "year_from": year_from_i,
            "year_to": year_to_i,
            "limit": limit_i,
            "sort_by_cited_by_count": sort_by_cited_by_count_b,
            "journal": journal_names,
            "journal_source_id": resolved_journal_ids or None,
            "knowledge_set_id": str(knowledge_set_uuid) if knowledge_set_uuid else None,
            "user_id": user_id_s,
            "mailto": mailto,
            "providers": providers_l,
            "provider_params": provider_params_d,
            "cleaner_params": cleaner_params_d,
            "call_attempt": min(call_attempt_i + 1, max_call_attempts_i),
            "max_call_attempts": max_call_attempts_i,
        }
        suggested_args = {k: v for k, v in suggested_args.items() if v is not None}
        extra_meta: dict[str, Any] = dict(precision_meta)
        extra_meta.update({"call_attempt": call_attempt_i, "max_call_attempts": max_call_attempts_i})
        return _build_retry_response(
            message=(
                "Journal/author names are ambiguous in OpenAlex. Please retry with explicit journal_source_id and/or author_id."
            ),
            suggested_args=suggested_args,
            warnings=precision_warnings or ["name lookup performed; retry with explicit IDs for exact filtering"],
            extra_meta=extra_meta,
        )

    # If we resolved IDs confidently from names, apply them as if caller provided them.
    if resolved_journal_ids and not journal_source_ids:
        journal_source_ids = resolved_journal_ids
    if resolved_author_ids and not author_ids:
        author_ids = resolved_author_ids

    # If journal is ambiguous (no IDs), we still try one fuzzy works call (best-effort)
    # ONLY on the last attempt.
    if is_last_attempt and journal_names and not journal_source_ids:
        base_parts = [p for p in [query, title, author] if isinstance(p, str) and p.strip()]
        base_search = openalex_params.get("search") if isinstance(openalex_params.get("search"), str) else None
        if not base_search:
            base_search = " ".join(base_parts)
        journal_hint = " ".join(journal_names)
        combined = (base_search + " " + journal_hint).strip() if base_search else journal_hint
        if combined:
            openalex_params["search"] = combined

    # Keep precision metadata for UI/LLM even on fuzzy fallback.
    if precision_warnings:
        precision_meta.setdefault("call_attempt", call_attempt_i)
        precision_meta.setdefault("max_call_attempts", max_call_attempts_i)

    if journal_source_ids:
        journal_filter = "primary_location.source.id:" + "|".join(journal_source_ids)
        if isinstance(openalex_params.get("filter"), str) and openalex_params["filter"].strip():
            openalex_params["filter"] = f"{openalex_params['filter']},{journal_filter}"
        else:
            openalex_params["filter"] = journal_filter

    if author_ids:
        author_filter = "authorships.author.id:" + "|".join(author_ids)
        if isinstance(openalex_params.get("filter"), str) and openalex_params["filter"].strip():
            openalex_params["filter"] = f"{openalex_params['filter']},{author_filter}"
        else:
            openalex_params["filter"] = author_filter

    # Optional: ask provider to sort by citations.
    if sort_by_cited_by_count_b:
        openalex_params.setdefault("sort", "cited_by_count:desc")

    cleaner_callable: str | None = None
    if cleaner_params_d and isinstance(cleaner_params_d.get("callable"), str):
        cleaner_callable = cleaner_params_d.get("callable")

    lq = LiteratureQuery(
        query=query,
        doi=doi,
        title=title,
        author=author,
        year_from=year_from_i,
        year_to=year_to_i,
        limit=limit_i,
        providers=providers_l,
        provider_params=normalized_provider_params,
    )

    result = await agg_fetch_works(
        lq,
        cleaner_callable=cleaner_callable,
        cleaner_params=cleaner_params_d,
    )

    # If provider fetch failed (no usable results + errors), allow limited tool-level retries.
    # Note: providers already do internal HTTP retries; this is to cap LLM-level repeated calls.
    if not result.success:
        full_fail_payload: dict[str, Any] = result.model_dump(mode="json")
        next_attempt = call_attempt_i + 1
        suggested_args: dict[str, Any] = {
            "query": query,
            "doi": doi,
            "title": title,
            "author": author,
            "year_from": year_from_i,
            "year_to": year_to_i,
            "limit": limit_i,
            "sort_by_cited_by_count": sort_by_cited_by_count_b,
            "journal": journal_names,
            "journal_source_id": journal_source_ids,
            "knowledge_set_id": str(knowledge_set_uuid) if knowledge_set_uuid else None,
            "user_id": user_id_s,
            "mailto": mailto,
            "providers": providers_l,
            "provider_params": provider_params_d,
            "cleaner_params": cleaner_params_d,
            "call_attempt": min(next_attempt, max_call_attempts_i),
            "max_call_attempts": max_call_attempts_i,
        }
        suggested_args = {k: v for k, v in suggested_args.items() if v is not None}
        errors_any = full_fail_payload.get("errors")
        stats_any = full_fail_payload.get("stats")
        errors_list: list[dict[str, Any]] = (
            [cast(dict[str, Any], e) for e in errors_any] if isinstance(errors_any, list) else []
        )
        stats_dict: dict[str, Any] = cast(dict[str, Any], stats_any) if isinstance(stats_any, dict) else {}
        if call_attempt_i >= max_call_attempts_i:
            # Hard stop: let the caller decide next action.
            return {
                "success": False,
                "results": [],
                "errors": errors_list,
                "stats": stats_dict,
                "meta": {
                    "needs_retry": False,
                    "call_attempt": call_attempt_i,
                    "max_call_attempts": max_call_attempts_i,
                    "return_policy": "Retry limit reached; do not automatically re-call.",
                },
                "summary": {
                    "note": (
                        "文献源请求失败，且已达到最大重试次数；请不要继续自动调用MCP。"
                        "只有当用户明确要求再次检索/更换条件，或你需要人工调整参数/等待后再试时，才发起新的调用。"
                        " (EN: Fetch failed and retry limit reached; do not auto re-call. Only re-call if the user explicitly requests a new search or after changing conditions.)"
                    )
                },
            }

        return _build_retry_response(
            message="Provider fetch failed. Please retry with the same parameters (or wait briefly) using the suggested call.",
            suggested_args=suggested_args,
            warnings=["provider fetch failed; limited retry is allowed"],
            extra_meta={"call_attempt": call_attempt_i, "max_call_attempts": max_call_attempts_i},
            errors=errors_list,
            stats=stats_dict,
        )

    # Optional: post-sort and truncate to limit.
    if sort_by_cited_by_count_b and result.results:
        result.results.sort(key=lambda w: (w.cited_by_count is not None, w.cited_by_count or 0), reverse=True)
        if len(result.results) > limit_i:
            result.results = result.results[:limit_i]
        result.meta = result.meta or {}
        result.meta["sorted_by"] = "cited_by_count:desc"
        result.meta["truncated_to"] = limit_i

    # --- Always-on persistence to Knowledge Base as XLSX ---
    persist_meta: dict[str, Any] = {"saved": False}

    # Build the *full* payload for persistence/export before we truncate anything.
    full_payload: dict[str, Any] = result.model_dump(mode="json")
    try:
        access_token = get_access_token()
        if access_token:
            user_info = AuthProvider.parse_user_info(access_token.claims)
            effective_user_id = user_id_s or user_info.id
            ksid = knowledge_set_uuid or _extract_knowledge_set_id(user_info.extra, access_token.claims)
            if ksid:
                filename = derive_xlsx_filename(topic=query or title)
                xlsx_bytes = build_xlsx_bytes(full_payload, query, title)
                # Persist locally (storage + DB + link)
                write_res = await persist_xlsx(effective_user_id, ksid, filename, xlsx_bytes)
                persist_meta = {
                    "saved": bool(write_res.get("success")),
                    "filename": filename,
                    "knowledge_set_id": str(ksid),
                    "error": write_res.get("error"),
                }
            else:
                persist_meta = {
                    "saved": False,
                    "error": "knowledge_set_id missing. Pass knowledge_set_id explicitly (preferred) or include it in token claims.",
                }
        else:
            persist_meta = {"saved": False, "error": "access_token missing"}
    except Exception as e:
        logger.error(f"Persist literature XLSX failed: {e}")
        persist_meta = {"saved": False, "error": str(e)}

    # --- Truncate what we return to the LLM (avoid context explosion) ---
    # We keep the standard LiteratureResult envelope fields, but only return a small
    # preview list for in-chat display.
    preview_limit = 5
    results_any = full_payload.get("results")
    results_raw_list: list[Any] = results_any if isinstance(results_any, list) else []
    results_list: list[dict[str, Any]] = [cast(dict[str, Any], w) for w in results_raw_list if isinstance(w, dict)]
    preview_results = _build_preview_results(results_list, max_items=preview_limit)

    out = dict(full_payload)
    out["results"] = preview_results
    out.setdefault("meta", {})
    if precision_warnings:
        out["meta"].setdefault("warnings", [])
        if isinstance(out["meta"].get("warnings"), list):
            out["meta"]["warnings"].extend(precision_warnings)
    if precision_meta:
        out["meta"].setdefault("precision", {})
        if isinstance(out["meta"].get("precision"), dict):
            out["meta"]["precision"].update(precision_meta)
    out["meta"]["persistence"] = persist_meta
    out["meta"].setdefault("preview", {})
    out["meta"]["preview"].update(
        {
            "returned_results": len(preview_results),
            "total_results": len(results_list),
            "limit": limit_i,
            "fields_stripped": ["raw", "referenced_works"],
            "return_policy": "Only a small preview is returned to the LLM; full cleaned results are persisted to XLSX when possible.",
        }
    )
    # A short human-readable summary for LLM/UI.
    providers_used = None
    try:
        meta_any = out.get("meta")
        if isinstance(meta_any, dict):
            providers_used = meta_any.get("providers") or meta_any.get("requested_providers")
    except Exception:
        providers_used = None
    if isinstance(providers_used, list):
        providers_list_any = cast(list[Any], providers_used)
        providers_list_str = [p for p in providers_list_any if isinstance(p, str) and p]
        providers_str = ",".join(providers_list_str)
    else:
        providers_str = ""
    saved_ok = bool(persist_meta.get("saved"))
    ksid_s = persist_meta.get("knowledge_set_id")
    filename_s = persist_meta.get("filename")

    precision_hint = ""
    try:
        suggested_call_any = None
        meta_any = out.get("meta")
        if isinstance(meta_any, dict):
            precision_any = meta_any.get("precision")
            if isinstance(precision_any, dict):
                suggested_call_any = precision_any.get("suggested_call")
        if suggested_call_any:
            precision_hint = (
                " 若需精确限定期刊/作者，请参考 meta.precision.suggested_call 再调用一次（建议只重试一次）。"
                " (EN: For exact journal/author filtering, re-call once using meta.precision.suggested_call.)"
            )
    except Exception:
        precision_hint = ""

    if saved_ok and filename_s and ksid_s:
        note = (
            f"已成功获取并清洗文献数据：对话中仅返回前{preview_limit}条用于展示；完整结果已保存为XLSX（{filename_s}，knowledge_set_id={ksid_s}）。"
            "请不要为了“确认”或“补全列表”而重复调用本MCP；只有当用户明确提出需要再次检索/换条件检索文献时，才再次调用。 "
            + precision_hint
            + f"(EN: Data fetched and cleaned. Only first {preview_limit} items are returned for chat display; full results saved to XLSX. Do NOT re-call this MCP unless the user explicitly requests a new/modified literature search.)"
        )
    else:
        note = (
            f"已成功获取并清洗文献数据：对话中仅返回前{preview_limit}条用于展示，以避免上下文爆炸。"
            "请不要为了“确认”或“补全列表”而重复调用本MCP；只有当用户明确提出需要再次检索/换条件检索文献时，才再次调用。 "
            + precision_hint
            + f"(EN: Data fetched and cleaned. Only first {preview_limit} items are returned to avoid context explosion. Do NOT re-call unless the user explicitly requests a new/modified literature search.)"
        )

    out["summary"] = {
        "query": query,
        "doi": doi,
        "title": title,
        "author": author,
        "year_from": year_from_i,
        "year_to": year_to_i,
        "providers": providers_str,
        "total_results": len(results_list),
        "returned_results": len(preview_results),
        "xlsx_saved": saved_ok,
        "xlsx_filename": filename_s,
        "note": note,
    }
    return out
