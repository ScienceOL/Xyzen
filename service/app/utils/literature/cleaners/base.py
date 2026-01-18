from __future__ import annotations

import importlib
import inspect
from typing import Any, Callable

from app.utils.literature.models import WorkRecord


CleanerCallable = Callable[..., Any]


def resolve_cleaner_callable(callable_path: str) -> CleanerCallable:
    """Resolve a dotted-path callable.

    Supported formats:
    - "package.module:function"
    - "package.module.function" (last segment treated as attribute)
    """

    path = callable_path.strip()
    if not path:
        raise ValueError("cleaner callable path is empty")

    if ":" in path:
        module_name, attr = path.split(":", 1)
    else:
        module_name, _, attr = path.rpartition(".")
        if not module_name:
            raise ValueError("cleaner callable must include a module path")

    module = importlib.import_module(module_name)
    fn = getattr(module, attr, None)
    if fn is None or not callable(fn):
        raise ValueError(f"cleaner callable not found or not callable: {callable_path}")
    return fn


async def run_cleaner(
    works: list[WorkRecord],
    *,
    cleaner: CleanerCallable | None,
    params: dict[str, Any] | None = None,
) -> tuple[list[WorkRecord], str | None]:
    """Run cleaner over works.

    Cleaner can be sync or async. It may accept either:
    - list[WorkRecord]
    - list[dict] (model_dump)

    Cleaner may return either:
    - list[WorkRecord]
    - list[dict]
    """

    if cleaner is None:
        return works, None

    kwargs = params or {}
    try:
        # Prefer passing WorkRecord objects; if cleaner rejects, user can adjust.
        if inspect.iscoroutinefunction(cleaner):
            out = await cleaner(works, **kwargs)
        else:
            out = cleaner(works, **kwargs)

        if out is None:
            return works, None

        if isinstance(out, list):
            if not out:
                return [], None
            if isinstance(out[0], WorkRecord):
                return out, None
            if isinstance(out[0], dict):
                return [WorkRecord.model_validate(x) for x in out], None

        # Fallback: allow returning a dict like {"results": [...]}
        if isinstance(out, dict) and isinstance(out.get("results"), list):
            results = out["results"]
            if not results:
                return [], None
            if isinstance(results[0], WorkRecord):
                return results, None
            if isinstance(results[0], dict):
                return [WorkRecord.model_validate(x) for x in results], None

        return works, "Cleaner returned unsupported output type"
    except Exception as exc:
        return works, f"Cleaner failed: {exc}"
