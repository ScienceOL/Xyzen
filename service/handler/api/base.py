from typing import Any

from fastapi import APIRouter

r = APIRouter()


@r.get("/")
async def root() -> dict[str, str]:
    return {"message": "Xyzen Service with FastAPI and MCP"}


@r.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "xyzen"}


@r.get("/mcp/status")
async def mcp_status() -> dict[str, Any]:
    return {
        "lab_tools": "http://127.0.0.1:48200/mcp/lab/",
        "other_tools": "http://127.0.0.1:48200/mcp/other/",
        "available_tools": {"lab": ["multiply"], "other": ["add"]},
    }
