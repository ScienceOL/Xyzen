import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket import mcp_websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP Updates"])


@router.websocket("")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for MCP server status updates.

    This endpoint subscribes to Redis pub/sub for cross-pod broadcasts,
    ensuring clients receive updates regardless of which pod they connect to.
    """
    # Start Redis subscriber if not already running (non-blocking, logs errors internally)
    try:
        await mcp_websocket_manager.start_subscriber()
    except Exception as e:
        # Log but don't fail - local broadcasts will still work
        logger.warning(f"Failed to start Redis subscriber for MCP updates: {e}")

    await mcp_websocket_manager.connect(websocket)
    try:
        while True:
            # Keep the connection open to listen for disconnects
            await websocket.receive_text()
    except WebSocketDisconnect:
        mcp_websocket_manager.disconnect(websocket)
