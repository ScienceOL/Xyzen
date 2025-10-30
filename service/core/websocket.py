"""
WebSocket connection management for broadcasting updates.
This module provides a centralized way to manage WebSocket connections
and broadcast messages to connected clients.
"""

import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection and add it to active connections."""
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from active connections."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: Any) -> None:
        """Broadcasts a message to all connected clients."""
        if not self.active_connections:
            return

        # Use default=str to handle non-serializable types like datetime
        message = json.dumps(data, default=str)

        # Create a copy of the list to avoid modification during iteration
        connections = self.active_connections.copy()

        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Remove the connection if sending fails (connection might be closed)
                self.disconnect(connection)


# Global instance for MCP server status broadcasts
mcp_websocket_manager = ConnectionManager()
