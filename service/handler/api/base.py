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

    from handler.mcp import MCP_SERVERS

    return {k: {"mount_path": v["mount_path"], "name": v["name"]} for k, v in MCP_SERVERS.items()}
