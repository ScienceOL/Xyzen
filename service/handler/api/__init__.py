from fastapi import APIRouter

from .base import r as base_router

# 创建一个统一的 API 路由器
api_router = APIRouter(prefix="/api", tags=["api"])


api_router.include_router(
    base_router,  # Include base API router
)
