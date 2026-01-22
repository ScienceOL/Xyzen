"""
E2B 沙箱管理器

管理 E2B 沙箱的生命周期、代码执行和文件操作。
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from e2b_code_interpreter import Sandbox as CodeInterpreter

from app.configs import configs
from app.sandbox.exceptions import (
    SandboxExecutionError,
    SandboxFileError,
    SandboxStartError,
    SandboxTimeoutError,
)
from app.sandbox.models import (
    ExecutionResult,
    FileInfo,
    SandboxInfo,
    SandboxStatus,
    SandboxType,
)

logger = logging.getLogger(__name__)


class E2BSandboxManager:
    """E2B 沙箱管理器 - 单例模式"""

    _instance: "E2BSandboxManager | None" = None

    def __init__(self) -> None:
        # session_id -> (SandboxInfo, sandbox实例)
        self._sandboxes: dict[str, tuple[SandboxInfo, Any]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "E2BSandboxManager":
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start(
        self,
        session_id: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER,
    ) -> SandboxInfo:
        """
        启动沙箱

        如果该 session 已有沙箱，返回现有实例
        """
        async with self._lock:
            # 检查是否已存在
            if session_id in self._sandboxes:
                info, _ = self._sandboxes[session_id]
                info.last_activity = datetime.now(timezone.utc)
                return info

            try:
                sandbox_config = configs.Sandbox
                api_key = sandbox_config.e2b_api_key

                # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
                if sandbox_type == SandboxType.CODE_INTERPRETER:
                    sandbox = await asyncio.to_thread(
                        CodeInterpreter.create,
                        api_key=api_key or None,
                        timeout=sandbox_config.sandbox_max_lifetime_secs,
                    )
                else:
                    # Custom Sandbox
                    from e2b import Sandbox as CustomSandbox

                    sandbox = await asyncio.to_thread(
                        CustomSandbox.create,
                        template=sandbox_config.custom_template_id,
                        api_key=api_key or None,
                        timeout=sandbox_config.sandbox_max_lifetime_secs,
                    )

                now = datetime.now(timezone.utc)
                info = SandboxInfo(
                    sandbox_id=sandbox.sandbox_id,
                    session_id=session_id,
                    sandbox_type=sandbox_type,
                    status=SandboxStatus.RUNNING,
                    created_at=now,
                    last_activity=now,
                )

                self._sandboxes[session_id] = (info, sandbox)
                logger.info(f"Started sandbox {info.sandbox_id} for session {session_id}")
                return info

            except Exception as e:
                logger.error(f"Failed to start sandbox for session {session_id}: {e}")
                raise SandboxStartError(f"Failed to start sandbox: {e}", cause=e)

    async def stop(self, session_id: str) -> None:
        """关停沙箱"""
        async with self._lock:
            if session_id not in self._sandboxes:
                return

            info, sandbox = self._sandboxes.pop(session_id)
            info.status = SandboxStatus.STOPPED

            try:
                # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
                await asyncio.to_thread(sandbox.kill)
                logger.info(f"Stopped sandbox {info.sandbox_id} for session {session_id}")
            except Exception as e:
                logger.warning(f"Error stopping sandbox {info.sandbox_id}: {e}")

    async def get_status(self, session_id: str) -> SandboxInfo | None:
        """获取沙箱状态"""
        async with self._lock:
            if session_id not in self._sandboxes:
                return None
            info, _ = self._sandboxes[session_id]
            return info

    async def _get_or_start(
        self,
        session_id: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER,
    ) -> tuple[SandboxInfo, Any]:
        """
        获取现有沙箱或启动新沙箱

        注意：此方法依赖 start() 的幂等性来处理并发场景，
        start() 内部会检查是否已存在并返回现有实例。
        """
        # start() 是幂等的，内部有锁保护，会检查并返回现有实例
        info = await self.start(session_id, sandbox_type)
        # 获取沙箱实例
        async with self._lock:
            _, sandbox = self._sandboxes[session_id]
        return info, sandbox

    async def execute(self, session_id: str, code: str) -> ExecutionResult:
        """执行代码"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.now(timezone.utc)

        try:
            timeout = configs.Sandbox.execution_timeout_secs
            # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
            result = await asyncio.to_thread(sandbox.run_code, code, timeout=timeout)

            artifacts: list[str] = []
            if hasattr(result, "results") and result.results:
                for r in result.results:
                    if hasattr(r, "png") and r.png:
                        artifacts.append(f"data:image/png;base64,{r.png}")
                    elif hasattr(r, "svg") and r.svg:
                        artifacts.append(f"data:image/svg+xml,{r.svg}")

            return ExecutionResult(
                success=result.error is None,
                output="\n".join(result.logs.stdout) if result.logs else "",
                error=str(result.error) if result.error else None,
                artifacts=artifacts,
            )

        except TimeoutError:
            raise SandboxTimeoutError("execute", configs.Sandbox.execution_timeout_secs)
        except Exception as e:
            logger.error(f"Execution error in sandbox for session {session_id}: {e}")
            raise SandboxExecutionError(f"Execution failed: {e}", code=code)

    async def upload(self, session_id: str, content: bytes, path: str) -> str:
        """上传文件到沙箱"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.now(timezone.utc)

        try:
            # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
            await asyncio.to_thread(sandbox.files.write, path, content)
            logger.debug(f"Uploaded file to {path} in sandbox for session {session_id}")
            return path
        except Exception as e:
            logger.error(f"File upload error for session {session_id}: {e}")
            raise SandboxFileError(f"Failed to upload file: {e}", path=path)

    async def download(self, session_id: str, path: str) -> bytes:
        """从沙箱下载文件"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.now(timezone.utc)

        try:
            # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
            content = await asyncio.to_thread(sandbox.files.read, path)
            return content if isinstance(content, bytes) else content.encode()
        except Exception as e:
            logger.error(f"File download error for session {session_id}: {e}")
            raise SandboxFileError(f"Failed to download file: {e}", path=path)

    async def list_files(self, session_id: str, path: str = "/") -> list[FileInfo]:
        """列出沙箱中的文件"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.now(timezone.utc)

        try:
            # E2B SDK 是同步的，使用 to_thread 避免阻塞事件循环
            entries = await asyncio.to_thread(sandbox.files.list, path)
            return [
                FileInfo(
                    path=f"{path.rstrip('/')}/{entry.name}",
                    size=entry.size if hasattr(entry, "size") else 0,
                    is_directory=entry.is_dir if hasattr(entry, "is_dir") else False,
                )
                for entry in entries
            ]
        except Exception as e:
            logger.error(f"List files error for session {session_id}: {e}")
            raise SandboxFileError(f"Failed to list files: {e}", path=path)

    async def install(self, session_id: str, packages: list[str]) -> ExecutionResult:
        """安装 pip 包"""
        code = f"import subprocess; subprocess.run(['pip', 'install'] + {packages!r}, check=True, capture_output=True)"
        return await self.execute(session_id, code)

    async def cleanup_expired(self) -> int:
        """清理超时沙箱，返回清理数量"""
        now = datetime.now(timezone.utc)
        expired_sessions: list[str] = []
        sandbox_config = configs.Sandbox

        async with self._lock:
            for session_id, (info, _) in self._sandboxes.items():
                lifetime = (now - info.created_at).total_seconds()
                if lifetime > sandbox_config.sandbox_max_lifetime_secs:
                    expired_sessions.append(session_id)
                    continue

                idle_time = (now - info.last_activity).total_seconds()
                if idle_time > sandbox_config.sandbox_idle_timeout_secs:
                    expired_sessions.append(session_id)

        for session_id in expired_sessions:
            await self.stop(session_id)

        if expired_sessions:
            logger.info(f"Cleaned up {len(expired_sessions)} expired sandboxes")

        return len(expired_sessions)
