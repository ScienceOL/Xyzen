"""Open Graph meta tag endpoints for social media link previews.

Serves lightweight HTML pages with OG/Twitter Card meta tags for:
- Shared conversations: /xyzen/og/share/{token}
- Shared agents: /xyzen/og/agent/{marketplace_id}

Real users are redirected to the SPA via JS; crawlers get the meta tags.
"""

from __future__ import annotations

import html
import logging
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/og", tags=["opengraph"])

_SITE_NAME = "Xyzen"
_SITE_DESCRIPTION = "构建自主 Agent 的开放平台与社区"
_DEFAULT_IMAGE = "https://storage.sciol.ac.cn/public/icon.png"


def _build_og_html(
    *,
    title: str,
    description: str,
    image: str = _DEFAULT_IMAGE,
    redirect_url: str,
    og_type: str = "website",
) -> str:
    """Build a minimal HTML page with OG meta tags and JS redirect."""
    t = html.escape(title)
    d = html.escape(description)
    img = html.escape(image)
    r = html.escape(redirect_url)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>{t}</title>
<meta name="description" content="{d}" />
<meta property="og:type" content="{og_type}" />
<meta property="og:title" content="{t}" />
<meta property="og:description" content="{d}" />
<meta property="og:image" content="{img}" />
<meta property="og:site_name" content="{html.escape(_SITE_NAME)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="{t}" />
<meta name="twitter:description" content="{d}" />
<meta name="twitter:image" content="{img}" />
<script>window.location.replace("{r}");</script>
</head>
<body>
<p>Redirecting to <a href="{r}">{t}</a>...</p>
</body>
</html>"""


@router.get("/share/{token}", response_class=HTMLResponse)
async def og_share(token: str, request: Request) -> HTMLResponse:
    """Serve OG meta tags for a shared conversation."""
    # Build the SPA redirect URL
    base = str(request.base_url).rstrip("/")
    redirect_url = f"{base}/#/share/{html.escape(token)}"

    # Try to fetch share metadata for a richer preview
    title = f"Shared Conversation — {_SITE_NAME}"
    description = _SITE_DESCRIPTION
    image = _DEFAULT_IMAGE

    try:
        from app.repos.chat_share import ChatShareRepository

        db: AsyncSession = await get_session().__anext__()
        try:
            repo = ChatShareRepository(db)
            share = await repo.get_by_token(token)
            if share:
                if share.title:
                    title = f"{share.title} — {_SITE_NAME}"
                # Build description from first user message
                agent_name = None
                if share.agent_snapshot:
                    agent_name = share.agent_snapshot.get("name")
                first_user_msg = ""
                for msg in share.messages_snapshot[:3]:
                    if msg.get("role") == "user":
                        raw = msg.get("content", "")
                        first_user_msg = raw[:120] + ("..." if len(raw) > 120 else "")
                        break

                parts: list[str] = []
                if agent_name:
                    parts.append(f"与 {agent_name} 的对话")
                if first_user_msg:
                    parts.append(f"「{first_user_msg}」")
                parts.append(f"{share.message_count} 条消息")
                if share.allow_fork:
                    parts.append("可继续对话")
                description = " · ".join(parts) if parts else _SITE_DESCRIPTION

                # Use agent avatar if available
                if share.agent_snapshot and share.agent_snapshot.get("avatar"):
                    image = share.agent_snapshot["avatar"]
        finally:
            await db.close()
    except Exception:
        logger.debug("Failed to fetch share metadata for OG tags, using defaults", exc_info=True)

    return HTMLResponse(
        _build_og_html(
            title=title,
            description=description,
            image=image,
            redirect_url=redirect_url,
        )
    )


@router.get("/agent/{marketplace_id}", response_class=HTMLResponse)
async def og_agent(marketplace_id: UUID, request: Request) -> HTMLResponse:
    """Serve OG meta tags for a shared agent from the marketplace."""
    base = str(request.base_url).rstrip("/")
    redirect_url = f"{base}/#/agent/{marketplace_id}"

    title = f"Agent — {_SITE_NAME}"
    description = _SITE_DESCRIPTION
    image = _DEFAULT_IMAGE

    try:
        from app.core.marketplace.agent_marketplace_service import AgentMarketplaceService

        db: AsyncSession = await get_session().__anext__()
        try:
            svc = AgentMarketplaceService(db)
            result = await svc.get_listing_with_snapshot(marketplace_id)
            if result:
                listing, _snapshot = result
                agent_name = listing.name or "Agent"
                title = f"{agent_name} — {_SITE_NAME}"

                parts: list[str] = []
                if listing.description:
                    desc_text = listing.description
                    parts.append(desc_text[:160] + ("..." if len(desc_text) > 160 else ""))
                else:
                    parts.append(f"{agent_name} — AI 智能助手")
                if listing.likes_count:
                    parts.append(f"{listing.likes_count} 收藏")
                if listing.forks_count:
                    parts.append(f"{listing.forks_count} 使用")
                description = " · ".join(parts) if parts else _SITE_DESCRIPTION

                if listing.avatar:
                    image = listing.avatar
        finally:
            await db.close()
    except Exception:
        logger.debug("Failed to fetch agent metadata for OG tags, using defaults", exc_info=True)

    return HTMLResponse(
        _build_og_html(
            title=title,
            description=description,
            image=image,
            redirect_url=redirect_url,
        )
    )
