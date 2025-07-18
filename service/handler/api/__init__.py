from fastapi import APIRouter, WebSocket

from .base import r as base_router

# 创建一个统一的 API 路由器
api_router = APIRouter(prefix="/api", tags=["api"])


api_router.include_router(
    base_router,
)


@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket 端点"""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except Exception as e:
        await websocket.close(code=1000, reason=str(e))
    finally:
        await websocket.close()
