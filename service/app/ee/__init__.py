"""Enterprise Edition detection.

Provides helpers to determine whether the current deployment is running
in Enterprise Edition (EE) mode or Community Edition (CE) mode.
"""

from collections.abc import Callable, Coroutine
from typing import Any

from app.configs import configs


def edition() -> str:
    """Return the current edition identifier: ``"ee"`` or ``"ce"``."""
    if configs.EE.Enabled and configs.EE.ApiUrl and configs.EE.LicenseKey:
        return "ee"
    return "ce"


def is_ee() -> bool:
    """Return ``True`` when the deployment is running in Enterprise Edition mode."""
    return edition() == "ee"


async def ee_only(fn: Callable[..., Coroutine[Any, Any, Any]], *args: Any, **kwargs: Any) -> Any:
    """Await ``fn(*args, **kwargs)`` only in EE mode; return ``None`` in CE.

    Accepts a **callable** (not a coroutine object) so that no coroutine is
    created at all in CE mode, avoiding "coroutine was never awaited" warnings.

    Usage::

        await ee_only(finalize_and_settle, ctx, provider, amount, token, "settlement")
    """
    if is_ee():
        return await fn(*args, **kwargs)
    return None
