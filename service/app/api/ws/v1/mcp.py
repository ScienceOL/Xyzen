from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket import mcp_websocket_manager

router = APIRouter(tags=["MCP Updates"])


@router.websocket("")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for MCP server status updates."""
    await mcp_websocket_manager.connect(websocket)
    try:
        while True:
            # Keep the connection open to listen for disconnects
            await websocket.receive_text()
    except WebSocketDisconnect:
        mcp_websocket_manager.disconnect(websocket)
