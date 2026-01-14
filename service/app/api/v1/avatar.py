"""
Avatar Proxy API.

Proxies DiceBear avatar requests through the backend for better
accessibility in regions with slow access to api.dicebear.com.

The avatars are SVG format and very small (~2-5KB), so caching
at CDN/browser level is usually sufficient.
"""

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(tags=["avatar"])

# DiceBear API base URL
DICEBEAR_BASE = "https://api.dicebear.com/9.x"

# Allowed styles to prevent abuse
ALLOWED_STYLES = {
    "adventurer",
    "avataaars",
    "bottts",
    "fun-emoji",
    "lorelei",
    "micah",
    "miniavs",
    "notionists",
    "open-peeps",
    "personas",
    "pixel-art",
    "shapes",
    "thumbs",
}

# HTTP client with connection pooling
_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0)
    return _client


@router.get("/{style}/svg")
async def proxy_avatar(
    style: str,
    seed: str = Query(..., description="Seed for generating the avatar"),
) -> Response:
    """
    Proxy DiceBear avatar generation.

    This endpoint proxies requests to api.dicebear.com for better
    accessibility in regions with slow international connectivity.

    Args:
        style: Avatar style (e.g., avataaars, bottts, pixel-art)
        seed: Seed string for deterministic avatar generation

    Returns:
        SVG image response with appropriate caching headers
    """
    if style not in ALLOWED_STYLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid style. Allowed: {', '.join(sorted(ALLOWED_STYLES))}",
        )

    # Build DiceBear URL
    url = f"{DICEBEAR_BASE}/{style}/svg?seed={seed}"

    try:
        client = await get_client()
        response = await client.get(url)
        response.raise_for_status()

        # Return SVG with long cache headers (avatars are deterministic)
        return Response(
            content=response.content,
            media_type="image/svg+xml",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",  # 1 year
                "Access-Control-Allow-Origin": "*",
            },
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"DiceBear API error: {e.response.text}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch avatar: {str(e)}",
        )
