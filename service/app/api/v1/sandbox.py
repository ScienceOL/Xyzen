"""
E2B 沙箱 API

提供 E2B 沙箱的 REST API 端点。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, UploadFile, File, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user
from app.sandbox import (
    E2BSandboxManager,
    ExecutionResult,
    FileInfo,
    SandboxInfo,
    SandboxType,
    SandboxError,
    SandboxStartError,
    SandboxExecutionError,
    SandboxTimeoutError,
    SandboxFileError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session/{session_id}/sandbox", tags=["Sandbox"])


# 请求/响应模型
class StartSandboxRequest(BaseModel):
    """启动沙箱请求"""
    sandbox_type: SandboxType = Field(
        default=SandboxType.CODE_INTERPRETER,
        description="沙箱类型：code_interpreter 或 custom",
    )


class ExecuteCodeRequest(BaseModel):
    """执行代码请求"""
    code: str = Field(..., description="要执行的 Python 代码")


class InstallPackagesRequest(BaseModel):
    """安装包请求"""
    packages: list[str] = Field(..., description="要安装的 pip 包列表")


# 依赖注入
def get_sandbox_manager() -> E2BSandboxManager:
    return E2BSandboxManager.get_instance()


SessionId = Annotated[str, Path(description="用户会话 ID")]


# 生命周期管理端点
@router.post(
    "/start",
    response_model=SandboxInfo,
    summary="启动沙箱",
    description="为指定会话启动一个新的 E2B 沙箱。如果沙箱已存在，返回现有实例。",
)
async def start_sandbox(
    session_id: SessionId,
    request: StartSandboxRequest,
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> SandboxInfo:
    """启动沙箱"""
    logger.info(f"User {current_user} starting sandbox for session {session_id}")
    try:
        return await manager.start(session_id, request.sandbox_type)
    except SandboxStartError as e:
        logger.error(f"Failed to start sandbox: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/stop",
    status_code=204,
    summary="关停沙箱",
    description="关停指定会话的沙箱。",
)
async def stop_sandbox(
    session_id: SessionId,
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> None:
    """关停沙箱"""
    logger.info(f"User {current_user} stopping sandbox for session {session_id}")
    await manager.stop(session_id)


@router.get(
    "/status",
    response_model=SandboxInfo | None,
    summary="获取沙箱状态",
    description="获取指定会话的沙箱状态信息。",
)
async def get_sandbox_status(
    session_id: SessionId,
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> SandboxInfo | None:
    """获取沙箱状态"""
    return await manager.get_status(session_id)


# 代码执行端点
@router.post(
    "/execute",
    response_model=ExecutionResult,
    summary="执行代码",
    description="在沙箱中执行 Python 代码。如果沙箱不存在，将自动启动。",
)
async def execute_code(
    session_id: SessionId,
    request: ExecuteCodeRequest,
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> ExecutionResult:
    """执行代码"""
    logger.info(f"User {current_user} executing code in session {session_id}")
    try:
        return await manager.execute(session_id, request.code)
    except SandboxTimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except SandboxExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except SandboxError as e:
        raise HTTPException(status_code=500, detail=str(e))


# 文件操作端点
@router.post(
    "/upload",
    summary="上传文件",
    description="上传文件到沙箱。",
)
async def upload_file(
    session_id: SessionId,
    file: UploadFile = File(...),
    path: str = Query("/home/user/upload", description="目标路径"),
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> dict[str, str]:
    """上传文件"""
    logger.info(f"User {current_user} uploading file to {path} in session {session_id}")
    try:
        content = await file.read()
        target_path = f"{path.rstrip('/')}/{file.filename}"
        result_path = await manager.upload(session_id, content, target_path)
        return {"path": result_path}
    except SandboxFileError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/download",
    summary="下载文件",
    description="从沙箱下载文件。",
)
async def download_file(
    session_id: SessionId,
    path: str = Query(..., description="文件路径"),
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> Response:
    """下载文件"""
    logger.info(f"User {current_user} downloading file from {path} in session {session_id}")
    try:
        content = await manager.download(session_id, path)
        filename = path.split("/")[-1]
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except SandboxFileError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/files",
    response_model=list[FileInfo],
    summary="列出文件",
    description="列出沙箱中指定路径的文件。",
)
async def list_files(
    session_id: SessionId,
    path: str = Query("/", description="目录路径"),
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> list[FileInfo]:
    """列出文件"""
    try:
        return await manager.list_files(session_id, path)
    except SandboxFileError as e:
        raise HTTPException(status_code=500, detail=str(e))


# 环境管理端点
@router.post(
    "/install",
    response_model=ExecutionResult,
    summary="安装依赖包",
    description="在沙箱中安装 pip 包。",
)
async def install_packages(
    session_id: SessionId,
    request: InstallPackagesRequest,
    current_user: str = Depends(get_current_user),
    manager: E2BSandboxManager = Depends(get_sandbox_manager),
) -> ExecutionResult:
    """安装依赖包"""
    logger.info(f"User {current_user} installing packages {request.packages} in session {session_id}")
    try:
        return await manager.install(session_id, request.packages)
    except SandboxError as e:
        raise HTTPException(status_code=500, detail=str(e))
