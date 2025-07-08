from fastapi import APIRouter, Path
from models import Lab

labs_router = APIRouter(prefix="/labs", tags=["labs"])


@labs_router.get("/{lid}")  # 实验室信息查询
async def get_lab_info(lid: Annotated[int, Path(description="实验室ID")]) -> Lab:
    lab = Lab.from_lid(lid)
    return lab


@labs_router.get("/{lid}/tools")  # 工具信息查询
async def get_lab_tools(
    lid: Annotated[int, Path(description="实验室ID")],
) -> set[MCPTool]:
    lab = Lab(
        lid=lid,
        name="示例实验室",
        description="测试用",
        type="Public",
        discipline="Chemistry",
    )
    return lab.mcp_tools_available
