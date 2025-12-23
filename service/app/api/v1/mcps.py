import logging
import os
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.configs import configs
from app.core.mcp import async_check_mcp_server_status
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.mcp import McpServer, McpServerCreate, McpServerUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mcps"])


class ToolTestRequest(BaseModel):
    parameters: Dict[str, Any] = {}


class ToolTestResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


class SmitheryActivateRequest(BaseModel):
    qualifiedName: str
    profile: Optional[str] = None


def _get_smithery_api_key() -> Optional[str]:
    # Prefer backend config; fallback to env var
    token = None
    try:
        token = configs.MCP.Smithery.Key
    except Exception:
        token = None

    if not token:
        token = os.getenv("XYZEN_MCP_SMITHERY_KEY") or os.getenv("SMITHERY_API_KEY")
    return token


@router.post("/smithery/activate", response_model=McpServer)
async def activate_smithery_server(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    background_tasks: BackgroundTasks,
    body: SmitheryActivateRequest,
) -> McpServer:
    """
    Activate a Smithery MCP server for the current user by fetching its connection URL
    and appending the api_key (server-side) and optional profile as query parameters.
    """
    api_key = _get_smithery_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="Smithery API key not configured on server")

    # Fetch server detail from Smithery Registry
    url = f"https://registry.smithery.ai/servers/{body.qualifiedName}"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        r = await client.get(url, headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to fetch Smithery server detail: {r.status_code}")
        detail = r.json()

    # Determine primary connection URL
    connections = detail.get("connections") or []
    primary = None
    if isinstance(connections, list) and connections:
        c0 = connections[0]
        primary = c0.get("deploymentUrl") or c0.get("url")
    if not primary:
        primary = detail.get("deploymentUrl")
    if not primary:
        raise HTTPException(status_code=400, detail="No connection URL available for this Smithery server")

    # Append api_key and optional profile to query string
    if not isinstance(primary, str):
        raise HTTPException(status_code=400, detail="Invalid connection URL for this Smithery server")

    parsed = urlparse(primary)
    q_items = parse_qsl(parsed.query or "", keep_blank_values=True)
    q: dict[str, str] = dict(q_items)
    q["api_key"] = api_key
    if body.profile:
        q["profile"] = body.profile
    new_query = urlencode(q)
    final_url = urlunparse(
        (
            parsed.scheme or "https",
            parsed.netloc,
            parsed.path,
            parsed.params,
            new_query,
            parsed.fragment,
        )
    )

    name = detail.get("displayName") or body.qualifiedName
    description = detail.get("description") or "Smithery MCP Server"

    db_mcp_server = McpServer(
        name=name,
        description=description,
        url=final_url,
        token="",  # api_key is embedded in URL; do not store separately
        user_id=user,
        status="offline",
        tools=[],
    )

    session.add(db_mcp_server)
    await session.commit()
    await session.refresh(db_mcp_server)

    if db_mcp_server.id:
        background_tasks.add_task(async_check_mcp_server_status, db_mcp_server.id)

    return db_mcp_server


@router.post("", response_model=McpServer)
async def create_mcp_server(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    background_tasks: BackgroundTasks,
    mcp_server: McpServerCreate,
) -> McpServer:
    # Create MCP server with authenticated user_id
    mcp_data = mcp_server.model_dump()
    mcp_data["user_id"] = user

    db_mcp_server = McpServer.model_validate(mcp_data)
    session.add(db_mcp_server)
    await session.commit()

    await session.refresh(db_mcp_server)

    if db_mcp_server.id:
        background_tasks.add_task(async_check_mcp_server_status, db_mcp_server.id)

    return db_mcp_server


@router.get("/discover")
async def discover_mcp_servers(
    user: str = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Discover available MCP servers registered in the backend.
    Returns server metadata for all registered MCP servers.
    """
    from app.mcp import registry

    # Get all servers
    all_servers = registry.get_all_servers()

    discovered = []
    for server_name, config in all_servers.items():
        discovered.append(
            {
                "name": config["name"],
                "module_name": server_name,
                "mount_path": config["mount_path"],
                "description": config.get("description")
                or f"Built-in MCP server: {server_name.replace('_', ' ').title()}",
                "is_builtin": True,
                "requires_auth": config.get("auth") is not None,
                "is_default": config.get("is_default", False),
            }
        )

    return discovered


@router.get("", response_model=list[McpServer])
async def read_mcp_servers(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    offset: int = 0,
    limit: int = 100,
) -> list[McpServer]:
    # Filter MCP servers by current user
    statement = select(McpServer).where(McpServer.user_id == user)

    statement = statement.offset(offset).limit(limit)
    result = await session.exec(statement)
    mcp_servers = result.all()
    return list(mcp_servers)


@router.get("/{mcp_server_id}", response_model=McpServer)
async def read_mcp_server(
    *, session: AsyncSession = Depends(get_session), user: str = Depends(get_current_user), mcp_server_id: UUID
) -> McpServer:
    mcp_server = await session.get(McpServer, mcp_server_id)
    if not mcp_server:
        raise HTTPException(status_code=404, detail="McpServer not found")

    # Check if the MCP server belongs to the current user
    if mcp_server.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to access this MCP server"
        )

    return mcp_server


@router.patch("/{mcp_server_id}", response_model=McpServer)
async def update_mcp_server(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    mcp_server_id: UUID,
    mcp_server: McpServerUpdate,
) -> McpServer:
    db_mcp_server = await session.get(McpServer, mcp_server_id)
    if not db_mcp_server:
        raise HTTPException(status_code=404, detail="McpServer not found")

    # Check if the MCP server belongs to the current user
    if db_mcp_server.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to modify this MCP server"
        )

    mcp_data = mcp_server.model_dump(exclude_unset=True)

    for key, value in mcp_data.items():
        setattr(db_mcp_server, key, value)

    session.add(db_mcp_server)
    await session.commit()
    await session.refresh(db_mcp_server)
    return db_mcp_server


@router.delete("/{mcp_server_id}")
async def delete_mcp_server(
    *, session: AsyncSession = Depends(get_session), user: str = Depends(get_current_user), mcp_server_id: UUID
) -> dict[str, Any]:
    mcp_server = await session.get(McpServer, mcp_server_id)
    if not mcp_server:
        raise HTTPException(status_code=404, detail="McpServer not found")

    # Check if the MCP server belongs to the current user
    if mcp_server.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to delete this MCP server"
        )

    await session.delete(mcp_server)
    await session.commit()
    return {"ok": True}


@router.post("/{mcp_server_id}/tools/{tool_name}/test", response_model=ToolTestResponse)
async def test_mcp_tool(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    mcp_server_id: UUID,
    tool_name: str,
    test_request: ToolTestRequest,
) -> ToolTestResponse:
    """
    Test an MCP tool by calling it with the provided parameters.
    """
    import time

    # Get the MCP server
    mcp_server = await session.get(McpServer, mcp_server_id)
    if not mcp_server:
        raise HTTPException(status_code=404, detail="McpServer not found")

    # Check if the MCP server belongs to the current user
    if mcp_server.user_id != user:
        raise HTTPException(
            status_code=403, detail="Access denied: You don't have permission to access this MCP server"
        )

    # Check if server is online
    if mcp_server.status != "online":
        raise HTTPException(status_code=400, detail="MCP server is offline")

    # Check if the tool exists
    if not mcp_server.tools:
        raise HTTPException(status_code=404, detail="No tools available on this server")

    tool_exists = any(tool.get("name") == tool_name for tool in mcp_server.tools)
    if not tool_exists:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found on this server")

    start_time = time.time()
    try:
        # Use the same tool execution logic as in chat.py
        from app.core.chat.tools import call_mcp_tool

        result = await call_mcp_tool(mcp_server, tool_name, test_request.parameters)

        end_time = time.time()
        execution_time_ms = int((end_time - start_time) * 1000)

        return ToolTestResponse(success=True, result=result, execution_time_ms=execution_time_ms)

    except Exception as e:
        end_time = time.time()
        # Safely compute execution time; if start_time is somehow unavailable, return None
        try:
            execution_time_ms = int((end_time - start_time) * 1000)
        except Exception:
            execution_time_ms = None

        return ToolTestResponse(success=False, error=str(e), execution_time_ms=execution_time_ms)


@router.post("/refresh", status_code=202)
async def refresh_all_mcp_servers(
    *,
    session: AsyncSession = Depends(get_session),
    user: str = Depends(get_current_user),
    background_tasks: BackgroundTasks,
) -> dict[str, bool]:
    """
    Trigger a background task to refresh the status of all MCP servers for the current user.
    """
    logger.info(f"Triggering MCP refresh for user {user}")
    statement = select(McpServer).where(McpServer.user_id == user)
    result = await session.exec(statement)
    mcp_servers = result.all()

    logger.info(f"Found {len(mcp_servers)} MCP servers to refresh for user {user}")

    for server in mcp_servers:
        if server.id:
            background_tasks.add_task(async_check_mcp_server_status, server.id)

    return {"ok": True}
