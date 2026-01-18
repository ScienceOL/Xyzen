from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any

import httpx

from app.utils.literature.cleaners.base import resolve_cleaner_callable, run_cleaner
from app.utils.literature.models import LiteratureQuery, LiteratureResult, ProviderError, ProviderStats, WorkRecord
from app.utils.literature.providers.openalex import OpenAlexProvider

logger = logging.getLogger(__name__)


DEFAULT_CLEANER_CALLABLE = "app.utils.literature.cleaners.doi:clean_works"


def _normalize_provider_keys(value: Any) -> list[str]:
    """Normalize provider keys coming from LLM/tool calls.

    We accept:
    - ["openalex"]
    - ["[\"openalex\"]"]  (JSON stringified list in a list)
    - "openalex" / "OpenAlex"
    - "openalex,crossref" (comma-separated)
    """
    out: list[str] = []
    seen: set[str] = set()

    def add_one(s: str) -> None:
        ss = s.strip()
        if not ss:
            return

        # If LLM passed a JSON list string (e.g. '["openalex"]'), unwrap it.
        if (ss.startswith("[") and ss.endswith("]")) or (ss.startswith("{") and ss.endswith("}")):
            try:
                obj = json.loads(ss)
            except Exception:
                obj = None
            if isinstance(obj, list):
                for item in obj:
                    if isinstance(item, str):
                        add_one(item)
                return

        # Accept comma-separated strings.
        if "," in ss:
            for part in ss.split(","):
                add_one(part)
            return

        key = ss.lower()
        if key not in seen:
            seen.add(key)
            out.append(key)

    if value is None:
        return []
    if isinstance(value, str):
        add_one(value)
        return out
    if isinstance(value, (list, tuple, set)):
        for v in value:
            if isinstance(v, str):
                add_one(v)
        return out
    return []


def _default_providers() -> dict[str, Any]:
    # NOTE: Provider instances are lightweight; we can recreate per request.
    return {
        "openalex": OpenAlexProvider(),
    }


def _is_retryable_http_error(exc: Exception) -> tuple[bool, int | None]:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status in {408, 429, 500, 502, 503, 504}, status
    if isinstance(exc, httpx.RequestError):
        return True, None
    return False, None


async def fetch_works(
    query: LiteratureQuery,
    *,
    max_concurrency: int = 5,
    retries: int = 3,
    base_backoff_s: float = 0.5,
    cleaner_callable: str | None = None,
    cleaner_params: dict[str, Any] | None = None,
) -> LiteratureResult:
    """Fetch works from one or more providers and run cleaner before returning.

    - Concurrency is bounded across providers.
    - Provider failures degrade gracefully into `errors`.
    - If cleaner fails, returns uncleaned works with an error entry.
    """

    provider_registry = _default_providers()
    requested_providers_raw = query.providers
    requested_providers = _normalize_provider_keys(requested_providers_raw)
    if not requested_providers:
        requested_providers = ["openalex"]

    chosen = [p for p in requested_providers if p in provider_registry]
    meta_warnings: list[str] = []
    if not chosen:
        supported = sorted(provider_registry.keys())
        # Degrade gracefully: fall back to the default/supported providers instead
        # of hard-failing the whole tool call.
        fallback = ["openalex"] if "openalex" in provider_registry else supported
        chosen = fallback
        meta_warnings.append("No supported providers matched the request; falling back to: " + ", ".join(fallback))
        meta_warnings.append("Supported providers: " + ", ".join(supported))

    semaphore = asyncio.Semaphore(max(1, max_concurrency))
    errors: list[ProviderError] = []
    stats: dict[str, ProviderStats] = {}
    all_works: list[WorkRecord] = []

    async def run_one(provider_name: str) -> None:
        provider = provider_registry[provider_name]
        async with semaphore:
            attempt = 0
            started = time.perf_counter()
            while True:
                try:
                    resp = await provider.search_works(query)
                    all_works.extend(resp.works)
                    took_ms = int((time.perf_counter() - started) * 1000)
                    stats[provider_name] = ProviderStats(
                        provider=provider_name,
                        requests=attempt + 1,
                        fetched=len(resp.works),
                        took_ms=took_ms,
                    )
                    return
                except Exception as exc:
                    retryable, status_code = _is_retryable_http_error(exc)
                    attempt += 1
                    if attempt > retries or not retryable:
                        took_ms = int((time.perf_counter() - started) * 1000)
                        stats[provider_name] = ProviderStats(
                            provider=provider_name,
                            requests=attempt,
                            fetched=0,
                            took_ms=took_ms,
                        )
                        errors.append(
                            ProviderError(
                                provider=provider_name,
                                message=str(exc),
                                status_code=status_code,
                                retryable=retryable,
                            )
                        )
                        return

                    delay = base_backoff_s * (2 ** (attempt - 1))
                    delay = delay + random.uniform(0, delay * 0.25)
                    await asyncio.sleep(delay)

    await asyncio.gather(*(run_one(p) for p in chosen))

    # Always run cleaner by default (as requested). Callers can override.
    effective_cleaner_callable = cleaner_callable or DEFAULT_CLEANER_CALLABLE
    cleaner = resolve_cleaner_callable(effective_cleaner_callable)
    cleaned_works, cleaner_error = await run_cleaner(all_works, cleaner=cleaner, params=cleaner_params)
    if cleaner_error:
        errors.append(ProviderError(provider="cleaner", message=cleaner_error, retryable=False))

    return LiteratureResult(
        success=len(cleaned_works) > 0 or len(errors) == 0,
        results=cleaned_works,
        errors=errors,
        stats=stats,
        meta={
            "providers": chosen,
            "requested_providers": requested_providers,
            "requested_providers_raw": requested_providers_raw,
            "warnings": meta_warnings,
            "cleaner_callable": effective_cleaner_callable,
        },
    )
