"""WebSocket chat endpoint (DEPRECATED).

Chat events now flow via SSE (``/api/v1/topics/{topic_id}/events``) and
client actions use REST (``/api/v1/topics/{topic_id}/messages`` etc.).

The router is kept empty so that the WS ``/v1/chat`` prefix is reserved.
"""

from fastapi import APIRouter

router = APIRouter(tags=["Chat"])
