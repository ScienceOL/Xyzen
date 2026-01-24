"""
E2B 沙箱模块

提供基于 E2B 的云原生代码执行环境。
"""

from app.sandbox.cleanup_task import start_cleanup_task, stop_cleanup_task
from app.sandbox.exceptions import (
    SandboxError,
    SandboxExecutionError,
    SandboxFileError,
    SandboxNotFoundError,
    SandboxStartError,
    SandboxTimeoutError,
)
from app.sandbox.manager import E2BSandboxManager
from app.sandbox.models import (
    ExecutionResult,
    FileInfo,
    SandboxInfo,
    SandboxStatus,
    SandboxType,
)

__all__ = [
    # 管理器
    "E2BSandboxManager",
    # 数据模型
    "SandboxType",
    "SandboxStatus",
    "SandboxInfo",
    "ExecutionResult",
    "FileInfo",
    # 异常
    "SandboxError",
    "SandboxNotFoundError",
    "SandboxStartError",
    "SandboxExecutionError",
    "SandboxTimeoutError",
    "SandboxFileError",
    # 清理任务
    "start_cleanup_task",
    "stop_cleanup_task",
]
