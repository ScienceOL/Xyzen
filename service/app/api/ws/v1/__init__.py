from fastapi import APIRouter

from .chat import router as chat_router
from .mcp import router as mcp_router

# Don't add tags here to avoid duplication in docs
ws_v1_router = APIRouter(
    prefix="/v1",
)


@ws_v1_router.get("/", tags=["WebSocket"])
async def root() -> dict[str, str]:
    return {"message": "Welcome to the WebSocket v1"}


# Don't add tags in include_router, let each router define its own tags
ws_v1_router.include_router(chat_router, prefix="/chat")
ws_v1_router.include_router(
    mcp_router,
    prefix="/mcp",
)
