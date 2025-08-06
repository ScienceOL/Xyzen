from fastapi import APIRouter

from .agents import router as agents_router
from .providers import router as providers_router
from .sessions import router as sessions_router

v1_router = APIRouter(
    prefix="/v1",
    tags=["v1"],
)


@v1_router.get("/")
async def root() -> dict[str, str]:
    return {"message": "Welcome to the API v1"}


v1_router.include_router(agents_router, prefix="/agents", tags=["agents"])
v1_router.include_router(providers_router, prefix="/providers", tags=["providers"])
v1_router.include_router(sessions_router, prefix="/sessions", tags=["sessions"])
