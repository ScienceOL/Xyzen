from __future__ import annotations

import re
from typing import Any

from app.utils.literature.models import WorkRecord


_DOI_IN_URL_RE = re.compile(r"doi\.org/(10\.\d{4,9}/\S+)", re.IGNORECASE)
_DOI_RE = re.compile(r"^(10\.\d{4,9}/\S+)$", re.IGNORECASE)


def normalize_doi(value: str | None) -> str | None:
    """Normalize DOI into canonical lowercase '10.xxxx/...' form.

    Accepts values like:
    - '10.1234/ABC'
    - 'doi:10.1234/ABC'
    - 'https://doi.org/10.1234/ABC'
    - 'http://doi.org/10.1234/ABC'
    """

    if not value:
        return None

    v = value.strip()
    if not v:
        return None

    # URL forms
    m = _DOI_IN_URL_RE.search(v)
    if m:
        return m.group(1).strip().lower()

    # doi: prefix
    if v.lower().startswith("doi:"):
        v = v[4:].strip()

    # raw form
    m2 = _DOI_RE.match(v)
    if m2:
        return m2.group(1).strip().lower()

    # Best-effort: sometimes DOI comes with trailing punctuation.
    v2 = v.rstrip(".);,]")
    m3 = _DOI_RE.match(v2)
    if m3:
        return m3.group(1).strip().lower()

    return None


def _merge_records(primary: WorkRecord, incoming: WorkRecord) -> WorkRecord:
    """Merge two records with the same DOI.

    Policy: keep primary, fill missing fields from incoming, prefer richer author list.
    Keep the original `raw` but annotate merged provenance into it (safe, since raw is dict).
    """

    data = primary.model_dump()

    def take(field: str) -> None:
        if data.get(field) in (None, "", []):
            val = getattr(incoming, field)
            if val not in (None, "", []):
                data[field] = val

    for f in ("title", "venue", "url", "pdf_url", "source_id", "year"):
        take(f)

    for f in ("journal", "work_type"):
        take(f)

    # Prefer the larger counts when available.
    try:
        p_cited = primary.cited_by_count
        i_cited = incoming.cited_by_count
        if isinstance(p_cited, int) or isinstance(i_cited, int):
            data["cited_by_count"] = max([x for x in (p_cited, i_cited) if isinstance(x, int)], default=None)
    except Exception:
        pass

    try:
        p_rc = primary.referenced_works_count
        i_rc = incoming.referenced_works_count
        if isinstance(p_rc, int) or isinstance(i_rc, int):
            data["referenced_works_count"] = max([x for x in (p_rc, i_rc) if isinstance(x, int)], default=None)
    except Exception:
        pass

    # Merge referenced work IDs conservatively (cap to avoid huge payloads).
    try:
        refs: list[str] = []
        for src in (primary.referenced_works or [], incoming.referenced_works or []):
            for r in src:
                if isinstance(r, str) and r and r not in refs:
                    refs.append(r)
                if len(refs) >= 200:
                    break
            if len(refs) >= 200:
                break
        if refs:
            data["referenced_works"] = refs
    except Exception:
        pass

    # Prefer longer authors list.
    if len(incoming.authors) > len(primary.authors):
        data["authors"] = [a.model_dump() for a in incoming.authors]

    # Preserve raw and add merge info.
    raw: dict[str, Any] = {}
    if isinstance(primary.raw, dict):
        raw.update(primary.raw)
    merged_from = raw.get("_merged_from")
    if not isinstance(merged_from, list):
        merged_from = []
    merged_from.append({"source": incoming.source, "source_id": incoming.source_id})
    raw["_merged_from"] = merged_from
    data["raw"] = raw

    return WorkRecord.model_validate(data)


def clean_works(
    works: list[WorkRecord],
    *,
    drop_without_doi: bool = False,
) -> list[WorkRecord]:
    """Normalize DOI, deduplicate by DOI, and return cleaned records.

    This is intended to be used as the default cleaner.

    Args:
        works: WorkRecord list from any providers.
        drop_without_doi: If True, drop records that have no parsable DOI.

    Returns:
        Deduplicated list. Records with same DOI are merged.
    """

    dedup: dict[str, WorkRecord] = {}
    kept_without_doi: list[WorkRecord] = []

    for w in works:
        doi_norm = normalize_doi(w.doi)
        if doi_norm is None:
            if not drop_without_doi:
                kept_without_doi.append(w)
            continue

        w2 = w.model_copy(update={"doi": doi_norm})
        if doi_norm not in dedup:
            dedup[doi_norm] = w2
        else:
            dedup[doi_norm] = _merge_records(dedup[doi_norm], w2)

    # Stable-ish ordering: DOI-sorted + append non-DOI works.
    cleaned = [dedup[k] for k in sorted(dedup.keys())]
    cleaned.extend(kept_without_doi)
    return cleaned
