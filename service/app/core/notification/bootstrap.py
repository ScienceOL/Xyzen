"""Bootstrap Novu on startup — zero-config local dev.

Registers admin, syncs the environment API key, pushes AppIdentifier, and
ensures required workflows exist and are active.

Only runs when ``SecretKey`` is empty (dev default).  In production the real
API key is injected via ``XYZEN_Novu_SecretKey`` and bootstrap is skipped.

Novu API notes:
- Response format: ``{"data": { ... }}``
- Login returns 201, not 200.
- Workflow creation returns ``active=false, draft=true`` — must PUT /status.
- Workflow CRUD uses ApiKey auth; admin/env uses Bearer JWT.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.configs import configs
from app.core.notification.events import WORKFLOW_DEFS

logger = logging.getLogger(__name__)


async def ensure_novu_setup() -> bool:
    """Register admin, sync SecretKey + AppIdentifier, create workflows.

    Also ensures VAPID keys for Web Push are available.

    Returns True when Novu is ready.
    """
    # Always try to initialise VAPID keys (independent of Novu)
    from app.core.notification.vapid import ensure_vapid_keys

    ensure_vapid_keys()

    novu = configs.Novu

    if not novu.Enable:
        return False

    # SecretKey already set (production) — skip bootstrap
    if novu.SecretKey:
        logger.info("Novu SecretKey already configured — skipping bootstrap")
        return True

    api = novu.ApiUrl.rstrip("/")

    try:
        jwt = await _register_or_login(api)
        if not jwt:
            logger.warning("Novu bootstrap: auth failed — notifications disabled")
            novu.Enable = False
            return False

        # Get the Development environment details
        env = await _get_dev_environment(api, jwt)
        if not env:
            logger.warning("Novu bootstrap: no environment found — notifications disabled")
            novu.Enable = False
            return False

        env_id: str = env.get("_id", "")
        env_identifier: str = env.get("identifier", "")
        env_api_key: str = (env.get("apiKeys") or [{}])[0].get("key", "")

        # Push our predetermined AppIdentifier into Novu if it differs
        if env_identifier != novu.AppIdentifier and env_id:
            await _set_app_identifier(api, jwt, env_id)

        # Sync the real API key into config (Novu generates it, cannot be preset)
        if env_api_key:
            novu.SecretKey = env_api_key
            logger.debug("Novu SecretKey synced from environment API key")

        # Ensure workflows exist (uses ApiKey auth)
        await _ensure_workflows(api, env_api_key)

        logger.info("Novu ready (AppIdentifier=%s)", novu.AppIdentifier)
        return True

    except httpx.ConnectError:
        logger.warning("Novu API unreachable at %s — notifications disabled", api)
        novu.Enable = False
        return False
    except Exception:
        logger.exception("Novu bootstrap failed — notifications disabled")
        novu.Enable = False
        return False


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def _register_or_login(api: str) -> str | None:
    """Login first; if the admin doesn't exist yet, try registering.

    Registration is disabled in production (DISABLE_USER_REGISTRATION=true).
    On a fresh database the first register call will succeed and create the
    admin.  On subsequent boots only login is needed.
    """
    novu = configs.Novu

    async with httpx.AsyncClient(timeout=15) as client:
        # Try login first (fast path — works once admin exists)
        resp = await client.post(
            f"{api}/v1/auth/login",
            json={"email": novu.AdminEmail, "password": novu.AdminPassword},
        )
        if resp.status_code in (200, 201):
            token = _extract_token(resp.json())
            if token:
                logger.debug("Novu admin login OK")
                return token

        # Admin doesn't exist yet — try register (only works on fresh DB
        # or if DISABLE_USER_REGISTRATION is not set)
        resp = await client.post(
            f"{api}/v1/auth/register",
            json={
                "email": novu.AdminEmail,
                "password": novu.AdminPassword,
                "firstName": "Admin",
                "organizationName": novu.AdminOrgName,
            },
        )
        if resp.status_code == 201:
            token = _extract_token(resp.json())
            if token:
                logger.info("Novu admin created (%s)", novu.AdminEmail)
                return token

        logger.warning("Novu auth failed (login=%s, register=%s)", 401, resp.status_code)
        return None


def _extract_token(body: dict) -> str | None:
    """Extract JWT from Novu response.  Format: {"data": {"token": "..."}}"""
    data = body.get("data", body)
    return data.get("token") or body.get("token") or None


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------


async def _get_dev_environment(api: str, jwt: str) -> dict | None:
    """GET /v1/environments → find the Development environment."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{api}/v1/environments",
            headers={"Authorization": f"Bearer {jwt}"},
        )
        if resp.status_code != 200:
            logger.warning("Novu /environments returned %s", resp.status_code)
            return None

        envs: list[dict] = resp.json().get("data", [])
        for env in envs:
            if env.get("name") == "Development" or env.get("type") == "dev":
                return env
        return envs[0] if envs else None


async def _set_app_identifier(api: str, jwt: str, env_id: str) -> None:
    """PUT /v1/environments/{id} — force identifier to our config value."""
    novu = configs.Novu
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            f"{api}/v1/environments/{env_id}",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"identifier": novu.AppIdentifier},
        )
        if resp.status_code == 200:
            logger.debug("Novu environment identifier set to %s", novu.AppIdentifier)
        else:
            logger.warning(
                "Failed to set Novu identifier (status=%s body=%s)",
                resp.status_code,
                resp.text[:200],
            )


# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------


async def _ensure_workflows(api: str, api_key: str) -> None:
    """Create and activate required workflows if they don't already exist."""
    if not api_key:
        return

    auth = {"Authorization": f"ApiKey {api_key}"}

    async with httpx.AsyncClient(timeout=15) as client:
        # Fetch existing workflows
        resp = await client.get(f"{api}/v1/workflows", headers=auth)
        if resp.status_code != 200:
            logger.warning("Novu /workflows returned %s", resp.status_code)
            return

        existing: set[str] = set()
        for wf in resp.json().get("data", []):
            for trigger in wf.get("triggers", []):
                existing.add(trigger.get("identifier", ""))

        # Get notification group ID (use default "General")
        resp = await client.get(f"{api}/v1/notification-groups", headers=auth)
        groups = resp.json().get("data", [])
        if not groups:
            logger.warning("Novu has no notification groups — cannot create workflows")
            return
        group_id: str = groups[0]["_id"]

        # Create missing workflows
        for wf_def in WORKFLOW_DEFS:
            if wf_def.identifier in existing:
                logger.debug("Novu workflow '%s' already exists", wf_def.identifier)
                continue

            step_template: dict[str, Any] = {"type": "in_app", "content": wf_def.in_app_body}

            resp = await client.post(
                f"{api}/v1/workflows",
                headers=auth,
                json={
                    "name": wf_def.name,
                    "notificationGroupId": group_id,
                    "steps": [{"template": step_template}],
                    "triggers": [{"identifier": wf_def.identifier, "type": "event", "variables": []}],
                },
            )
            if resp.status_code != 201:
                logger.warning("Failed to create workflow '%s' (status=%s)", wf_def.identifier, resp.status_code)
                continue

            workflow_id = resp.json().get("data", {}).get("_id", "")
            logger.info("Novu workflow '%s' created", wf_def.identifier)

            # Activate it (created as draft by default)
            if workflow_id:
                resp = await client.put(
                    f"{api}/v1/workflows/{workflow_id}/status",
                    headers=auth,
                    json={"active": True},
                )
                if resp.status_code == 200:
                    logger.debug("Novu workflow '%s' activated", wf_def.identifier)
                else:
                    logger.warning("Failed to activate workflow '%s' (status=%s)", wf_def.identifier, resp.status_code)
