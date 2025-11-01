from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.mcp import async_check_mcp_server_status
from middleware.auth import get_current_user
from middleware.database.connection import get_session
from models.mcp import McpServer, McpServerCreate, McpServerUpdate

router = APIRouter(tags=["mcps"])


class ToolTestRequest(BaseModel):
    parameters: Dict[str, Any] = {}


class ToolTestResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


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
    Returns server metadata for users to easily add them.
    """
    from handler.mcp import registry

    discovered = []
    for server_name, config in registry.get_all_servers().items():
        discovered.append(
            {
                "name": config["name"],
                "module_name": server_name,
                "mount_path": config["mount_path"],
                "description": f"Built-in MCP server: {server_name.replace('_', ' ').title()}",
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
    statement = select(McpServer).where(McpServer.user_id == user).offset(offset).limit(limit)
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
        from core.chat.tools import call_mcp_tool

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
    statement = select(McpServer).where(McpServer.user_id == user)
    result = await session.exec(statement)
    mcp_servers = result.all()

    for server in mcp_servers:
        if server.id:
            background_tasks.add_task(async_check_mcp_server_status, server.id)

    return {"ok": True}
