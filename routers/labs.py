from typing import Annotated
from fastapi import APIRouter, Path, HTTPException
from models import Lab, MCPTool

labs_router = APIRouter(prefix="/labs", tags=["labs"])


@labs_router.get("/{lid}")  # 实验室信息查询
async def get_lab_info(lid: Annotated[int, Path(description="实验室ID")]) -> Lab:
    try:
        lab = Lab.from_lid(lid)
        return lab
    except Exception as e:
        raise HTTPException(status_code=404, detail="实验室不存在")


@labs_router.get("/{lid}/tools")  # 工具信息查询
async def get_lab_tools(
    lid: Annotated[int, Path(description="实验室ID")],
) -> list[MCPTool]:
    try:
        lab = Lab.from_lid(lid)
        return lab.mcp_tools_available
    except Exception as e:
        raise HTTPException(status_code=404, detail="实验室不存在")

@labs_router.post("/{lid}/tools")
async def add_lab_tool(
    lid: Annotated[int, Path(description="实验室ID")],
    tool: MCPTool,
) -> None:
    lab = Lab.from_lid(lid)
    if lab is None:
        raise HTTPException(status_code=404, detail="实验室不存在")
    else:
        lab.add_mcp_tool(tool)

@labs_router.delete("/{lid}/tools")
async def remove_lab_tool(
    lid: Annotated[int, Path(description="实验室ID")],
    tool: MCPTool,
) -> None:
    lab = Lab.from_lid(lid)
    if lab is None:
        raise HTTPException(status_code=404, detail="实验室不存在")
    else:
        lab.remove_mcp_tool(tool)