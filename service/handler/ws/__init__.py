from fastapi import APIRouter

from .v1 import ws_v1_router

# Don't add tags here to avoid duplication in docs
ws_router = APIRouter(
    prefix="/ws",
)

ws_router.include_router(ws_v1_router)
