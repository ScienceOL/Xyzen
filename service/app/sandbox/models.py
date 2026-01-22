"""
沙箱数据模型

定义 E2B 沙箱相关的数据结构。
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SandboxType(str, Enum):
    """沙箱类型"""

    CODE_INTERPRETER = "code_interpreter"  # E2B 预置环境
    CUSTOM = "custom"  # 自定义镜像


class SandboxStatus(str, Enum):
    """沙箱状态"""

    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class SandboxInfo(BaseModel):
    """沙箱实例信息"""

    sandbox_id: str  # E2B 返回的沙箱 ID
    session_id: str  # 关联的用户会话 ID
    sandbox_type: SandboxType
    status: SandboxStatus
    created_at: datetime
    last_activity: datetime  # 用于超时清理


class ExecutionResult(BaseModel):
    """代码执行结果"""

    success: bool
    output: str = ""  # stdout
    error: str | None = None  # stderr 或异常信息
    execution_time_ms: int = 0
    artifacts: list[str] = Field(default_factory=list)  # 生成的文件/图表 URL


class FileInfo(BaseModel):
    """文件信息"""

    path: str
    size: int
    is_directory: bool
