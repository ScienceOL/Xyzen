from fastapi import APIRouter

from .api import api_router
from .ws import ws_router

# Create a single root router to include all other routers
# Don't add tags here to avoid duplication in docs
root_router = APIRouter(prefix="/xyzen")

root_router.include_router(api_router)
root_router.include_router(ws_router)
