# E2B 沙箱替换实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有沙箱实现完全替换为 E2B 云原生沙箱，支持代码执行、文件操作和依赖安装。

**Architecture:** 采用单例管理器模式，E2BSandboxManager 管理所有沙箱实例的生命周期。每个用户 Session 绑定一个沙箱，通过显式 API 启动/关停，后台任务自动清理超时沙箱。

**Tech Stack:** E2B SDK (e2b, e2b-code-interpreter), FastAPI, Pydantic, LangChain

---

## Task 1: 添加 E2B 依赖

**Files:**
- Modify: `service/pyproject.toml:26-27`

**Step 1: 修改依赖配置**

在 `pyproject.toml` 的 `dependencies` 中移除 `llm-sandbox` 并添加 E2B：

```toml
# 移除这行:
# "llm-sandbox[docker,k8s]>=0.3.20",

# 添加这两行:
"e2b>=1.0.0",
"e2b-code-interpreter>=1.0.0",
```

**Step 2: 安装依赖**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && uv sync`
Expected: 成功安装 e2b 和 e2b-code-interpreter

**Step 3: Commit**

```bash
git add service/pyproject.toml service/uv.lock
git commit -m "build: replace llm-sandbox with e2b dependencies"
```

---

## Task 2: 创建数据模型

**Files:**
- Create: `service/app/sandbox/models.py`
- Test: `service/tests/unit/test_sandbox/test_models.py`

**Step 1: 创建测试文件**

```python
# service/tests/unit/test_sandbox/test_models.py
"""Tests for sandbox data models."""

from datetime import datetime

import pytest

from app.sandbox.models import (
    ExecutionResult,
    FileInfo,
    SandboxInfo,
    SandboxStatus,
    SandboxType,
)


class TestSandboxType:
    """Tests for SandboxType enum."""

    def test_code_interpreter_value(self):
        assert SandboxType.CODE_INTERPRETER.value == "code_interpreter"

    def test_custom_value(self):
        assert SandboxType.CUSTOM.value == "custom"


class TestSandboxStatus:
    """Tests for SandboxStatus enum."""

    def test_all_statuses(self):
        assert SandboxStatus.STARTING.value == "starting"
        assert SandboxStatus.RUNNING.value == "running"
        assert SandboxStatus.STOPPED.value == "stopped"
        assert SandboxStatus.ERROR.value == "error"


class TestSandboxInfo:
    """Tests for SandboxInfo model."""

    def test_create_sandbox_info(self):
        now = datetime.utcnow()
        info = SandboxInfo(
            sandbox_id="sbx_123",
            session_id="session_456",
            sandbox_type=SandboxType.CODE_INTERPRETER,
            status=SandboxStatus.RUNNING,
            created_at=now,
            last_activity=now,
        )
        assert info.sandbox_id == "sbx_123"
        assert info.session_id == "session_456"
        assert info.sandbox_type == SandboxType.CODE_INTERPRETER
        assert info.status == SandboxStatus.RUNNING


class TestExecutionResult:
    """Tests for ExecutionResult model."""

    def test_successful_result(self):
        result = ExecutionResult(
            success=True,
            output="Hello, World!",
            execution_time_ms=100,
        )
        assert result.success is True
        assert result.output == "Hello, World!"
        assert result.error is None
        assert result.artifacts == []

    def test_failed_result(self):
        result = ExecutionResult(
            success=False,
            error="SyntaxError: invalid syntax",
        )
        assert result.success is False
        assert result.error == "SyntaxError: invalid syntax"

    def test_result_with_artifacts(self):
        result = ExecutionResult(
            success=True,
            output="",
            artifacts=["https://e2b.dev/artifacts/chart.png"],
        )
        assert len(result.artifacts) == 1


class TestFileInfo:
    """Tests for FileInfo model."""

    def test_file_info(self):
        info = FileInfo(path="/home/user/data.csv", size=1024, is_directory=False)
        assert info.path == "/home/user/data.csv"
        assert info.size == 1024
        assert info.is_directory is False

    def test_directory_info(self):
        info = FileInfo(path="/home/user", size=4096, is_directory=True)
        assert info.is_directory is True
```

**Step 2: 运行测试验证失败**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pytest tests/unit/test_sandbox/test_models.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.sandbox.models'"

**Step 3: 创建模型文件**

```python
# service/app/sandbox/models.py
"""
Sandbox Data Models

Pydantic models for E2B sandbox management.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SandboxType(str, Enum):
    """沙箱类型"""

    CODE_INTERPRETER = "code_interpreter"  # E2B 预置 Python 环境
    CUSTOM = "custom"  # 自定义模板


class SandboxStatus(str, Enum):
    """沙箱状态"""

    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class SandboxInfo(BaseModel):
    """沙箱实例信息"""

    sandbox_id: str = Field(..., description="E2B 返回的沙箱 ID")
    session_id: str = Field(..., description="关联的用户会话 ID")
    sandbox_type: SandboxType = Field(..., description="沙箱类型")
    status: SandboxStatus = Field(..., description="沙箱状态")
    created_at: datetime = Field(..., description="创建时间")
    last_activity: datetime = Field(..., description="最后活动时间，用于超时清理")


class ExecutionResult(BaseModel):
    """代码执行结果"""

    success: bool = Field(..., description="执行是否成功")
    output: str = Field(default="", description="标准输出")
    error: str | None = Field(default=None, description="错误信息")
    execution_time_ms: int = Field(default=0, description="执行耗时（毫秒）")
    artifacts: list[str] = Field(default_factory=list, description="生成的文件/图表 URL")


class FileInfo(BaseModel):
    """文件信息"""

    path: str = Field(..., description="文件路径")
    size: int = Field(..., description="文件大小（字节）")
    is_directory: bool = Field(..., description="是否为目录")


# API 请求模型
class StartSandboxRequest(BaseModel):
    """启动沙箱请求"""

    sandbox_type: SandboxType = Field(
        default=SandboxType.CODE_INTERPRETER,
        description="沙箱类型",
    )


class ExecuteCodeRequest(BaseModel):
    """执行代码请求"""

    code: str = Field(..., description="要执行的 Python 代码")


class InstallPackagesRequest(BaseModel):
    """安装依赖请求"""

    packages: list[str] = Field(..., description="要安装的 pip 包列表")
```

**Step 4: 运行测试验证通过**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pytest tests/unit/test_sandbox/test_models.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add service/app/sandbox/models.py service/tests/unit/test_sandbox/test_models.py
git commit -m "feat(sandbox): add E2B sandbox data models"
```

---

## Task 3: 创建自定义异常

**Files:**
- Create: `service/app/sandbox/exceptions.py`

**Step 1: 创建异常文件**

```python
# service/app/sandbox/exceptions.py
"""
Sandbox Exceptions

Custom exceptions for E2B sandbox operations.
"""


class SandboxError(Exception):
    """沙箱操作基础异常"""

    pass


class SandboxNotFoundError(SandboxError):
    """沙箱不存在"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        super().__init__(f"Sandbox not found for session: {session_id}")


class SandboxStartError(SandboxError):
    """沙箱启动失败"""

    pass


class SandboxExecutionError(SandboxError):
    """代码执行失败"""

    pass


class SandboxTimeoutError(SandboxError):
    """沙箱操作超时"""

    pass


class SandboxFileError(SandboxError):
    """文件操作失败"""

    pass
```

**Step 2: Commit**

```bash
git add service/app/sandbox/exceptions.py
git commit -m "feat(sandbox): add custom exceptions for E2B operations"
```

---

## Task 4: 更新沙箱配置

**Files:**
- Modify: `service/app/configs/sandbox.py`

**Step 1: 重写配置文件**

```python
# service/app/configs/sandbox.py
"""
E2B Sandbox Configuration

Configuration for E2B cloud sandbox execution.
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class SandboxConfig(BaseSettings):
    """E2B 沙箱配置"""

    # E2B API 配置
    e2b_api_key: str = Field(
        default="",
        description="E2B API Key",
    )

    # 沙箱类型配置
    default_sandbox_type: str = Field(
        default="code_interpreter",
        description="默认沙箱类型: code_interpreter, custom",
    )

    custom_template_id: str = Field(
        default="",
        description="Custom Sandbox 的模板 ID（E2B 控制台创建）",
    )

    # 超时配置
    execution_timeout_secs: int = Field(
        default=300,  # 5 分钟
        description="单次代码执行超时（秒）",
    )

    sandbox_idle_timeout_secs: int = Field(
        default=1800,  # 30 分钟
        description="沙箱空闲超时，超时后自动关闭",
    )

    sandbox_max_lifetime_secs: int = Field(
        default=7200,  # 2 小时
        description="沙箱最大存活时间",
    )
```

**Step 2: Commit**

```bash
git add service/app/configs/sandbox.py
git commit -m "refactor(sandbox): simplify config for E2B integration"
```

---

## Task 5: 实现核心管理器

**Files:**
- Create: `service/app/sandbox/manager.py`
- Test: `service/tests/unit/test_sandbox/test_manager.py`

**Step 1: 创建测试文件**

```python
# service/tests/unit/test_sandbox/test_manager.py
"""Tests for E2B sandbox manager."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.sandbox.manager import E2BSandboxManager
from app.sandbox.models import SandboxInfo, SandboxStatus, SandboxType


@pytest.fixture
def manager():
    """Create a fresh manager instance for each test."""
    # Reset singleton
    E2BSandboxManager._instance = None
    return E2BSandboxManager.get_instance()


@pytest.fixture
def mock_code_interpreter():
    """Mock E2B CodeInterpreter."""
    with patch("app.sandbox.manager.CodeInterpreter") as mock:
        sandbox = MagicMock()
        sandbox.sandbox_id = "sbx_test_123"
        mock.return_value.__enter__ = MagicMock(return_value=sandbox)
        mock.return_value.__exit__ = MagicMock(return_value=False)
        yield mock, sandbox


class TestE2BSandboxManagerSingleton:
    """Tests for singleton behavior."""

    def test_get_instance_returns_same_instance(self):
        E2BSandboxManager._instance = None
        instance1 = E2BSandboxManager.get_instance()
        instance2 = E2BSandboxManager.get_instance()
        assert instance1 is instance2

    def test_reset_clears_instance(self):
        E2BSandboxManager._instance = None
        instance1 = E2BSandboxManager.get_instance()
        E2BSandboxManager.reset()
        instance2 = E2BSandboxManager.get_instance()
        assert instance1 is not instance2


class TestE2BSandboxManagerStart:
    """Tests for sandbox start functionality."""

    @pytest.mark.asyncio
    async def test_start_creates_new_sandbox(self, manager, mock_code_interpreter):
        mock_class, mock_sandbox = mock_code_interpreter

        with patch("app.sandbox.manager.CodeInterpreter") as mock_ci:
            mock_instance = MagicMock()
            mock_instance.sandbox_id = "sbx_123"
            mock_ci.return_value = mock_instance

            info = await manager.start("session_1")

            assert info.session_id == "session_1"
            assert info.sandbox_type == SandboxType.CODE_INTERPRETER
            assert info.status == SandboxStatus.RUNNING

    @pytest.mark.asyncio
    async def test_start_returns_existing_sandbox(self, manager):
        # Manually add a sandbox
        existing_info = SandboxInfo(
            sandbox_id="sbx_existing",
            session_id="session_1",
            sandbox_type=SandboxType.CODE_INTERPRETER,
            status=SandboxStatus.RUNNING,
            created_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
        )
        manager._sandboxes["session_1"] = (existing_info, MagicMock())

        info = await manager.start("session_1")

        assert info.sandbox_id == "sbx_existing"


class TestE2BSandboxManagerStop:
    """Tests for sandbox stop functionality."""

    @pytest.mark.asyncio
    async def test_stop_removes_sandbox(self, manager):
        mock_sandbox = MagicMock()
        info = SandboxInfo(
            sandbox_id="sbx_123",
            session_id="session_1",
            sandbox_type=SandboxType.CODE_INTERPRETER,
            status=SandboxStatus.RUNNING,
            created_at=datetime.utcnow(),
            last_activity=datetime.utcnow(),
        )
        manager._sandboxes["session_1"] = (info, mock_sandbox)

        await manager.stop("session_1")

        assert "session_1" not in manager._sandboxes
        mock_sandbox.kill.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_nonexistent_sandbox_is_noop(self, manager):
        # Should not raise
        await manager.stop("nonexistent_session")


class TestE2BSandboxManagerCleanup:
    """Tests for cleanup functionality."""

    @pytest.mark.asyncio
    async def test_cleanup_expired_removes_idle_sandboxes(self, manager):
        mock_sandbox = MagicMock()
        old_time = datetime.utcnow() - timedelta(hours=1)
        info = SandboxInfo(
            sandbox_id="sbx_old",
            session_id="session_old",
            sandbox_type=SandboxType.CODE_INTERPRETER,
            status=SandboxStatus.RUNNING,
            created_at=old_time,
            last_activity=old_time,
        )
        manager._sandboxes["session_old"] = (info, mock_sandbox)

        # Patch config to have short timeout
        with patch("app.sandbox.manager.sandbox_config") as mock_config:
            mock_config.sandbox_idle_timeout_secs = 60
            mock_config.sandbox_max_lifetime_secs = 3600

            count = await manager.cleanup_expired()

        assert count == 1
        assert "session_old" not in manager._sandboxes
```

**Step 2: 运行测试验证失败**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pytest tests/unit/test_sandbox/test_manager.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.sandbox.manager'"

**Step 3: 创建管理器文件**

```python
# service/app/sandbox/manager.py
"""
E2B Sandbox Manager

Singleton manager for E2B sandbox instances lifecycle.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

from e2b_code_interpreter import Sandbox as CodeInterpreter

from app.configs import configs
from app.sandbox.exceptions import (
    SandboxExecutionError,
    SandboxFileError,
    SandboxNotFoundError,
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

# 获取沙箱配置
sandbox_config = configs.Sandbox


class E2BSandboxManager:
    """E2B 沙箱管理器 - 单例模式"""

    _instance: "E2BSandboxManager | None" = None

    def __init__(self) -> None:
        # session_id -> (SandboxInfo, E2B Sandbox 实例)
        self._sandboxes: dict[str, tuple[SandboxInfo, Any]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "E2BSandboxManager":
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """重置单例（用于测试）"""
        if cls._instance is not None:
            # 清理所有沙箱
            for _, sandbox in cls._instance._sandboxes.values():
                try:
                    sandbox.kill()
                except Exception:
                    pass
            cls._instance._sandboxes.clear()
        cls._instance = None

    async def start(
        self,
        session_id: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER,
    ) -> SandboxInfo:
        """
        启动沙箱。如果该 session 已有沙箱则直接返回。

        Args:
            session_id: 用户会话 ID
            sandbox_type: 沙箱类型

        Returns:
            SandboxInfo 沙箱信息
        """
        async with self._lock:
            # 检查是否已存在
            if session_id in self._sandboxes:
                info, _ = self._sandboxes[session_id]
                logger.info(f"Sandbox already exists for session {session_id}")
                return info

            logger.info(f"Starting {sandbox_type.value} sandbox for session {session_id}")

            try:
                # 创建 E2B 沙箱
                if sandbox_type == SandboxType.CODE_INTERPRETER:
                    sandbox = CodeInterpreter(
                        api_key=sandbox_config.e2b_api_key or None,
                        timeout=sandbox_config.sandbox_max_lifetime_secs,
                    )
                else:
                    # Custom sandbox - 使用模板
                    from e2b import Sandbox as CustomSandbox

                    if not sandbox_config.custom_template_id:
                        raise SandboxStartError("Custom template ID not configured")

                    sandbox = CustomSandbox(
                        template=sandbox_config.custom_template_id,
                        api_key=sandbox_config.e2b_api_key or None,
                        timeout=sandbox_config.sandbox_max_lifetime_secs,
                    )

                now = datetime.utcnow()
                info = SandboxInfo(
                    sandbox_id=sandbox.sandbox_id,
                    session_id=session_id,
                    sandbox_type=sandbox_type,
                    status=SandboxStatus.RUNNING,
                    created_at=now,
                    last_activity=now,
                )

                self._sandboxes[session_id] = (info, sandbox)
                logger.info(f"Sandbox {sandbox.sandbox_id} started for session {session_id}")

                return info

            except Exception as e:
                logger.error(f"Failed to start sandbox for session {session_id}: {e}")
                raise SandboxStartError(f"Failed to start sandbox: {e}") from e

    async def stop(self, session_id: str) -> None:
        """
        关停沙箱。

        Args:
            session_id: 用户会话 ID
        """
        async with self._lock:
            if session_id not in self._sandboxes:
                logger.debug(f"No sandbox found for session {session_id}")
                return

            info, sandbox = self._sandboxes.pop(session_id)
            info.status = SandboxStatus.STOPPED

            try:
                sandbox.kill()
                logger.info(f"Sandbox {info.sandbox_id} stopped for session {session_id}")
            except Exception as e:
                logger.error(f"Error stopping sandbox {info.sandbox_id}: {e}")

    async def get(self, session_id: str) -> SandboxInfo | None:
        """
        获取沙箱信息。

        Args:
            session_id: 用户会话 ID

        Returns:
            SandboxInfo 或 None
        """
        if session_id in self._sandboxes:
            info, _ = self._sandboxes[session_id]
            return info
        return None

    async def _get_or_start(
        self,
        session_id: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER,
    ) -> tuple[SandboxInfo, Any]:
        """
        获取沙箱，如果不存在则启动。

        Args:
            session_id: 用户会话 ID
            sandbox_type: 沙箱类型

        Returns:
            (SandboxInfo, sandbox实例) 元组
        """
        if session_id not in self._sandboxes:
            await self.start(session_id, sandbox_type)

        return self._sandboxes[session_id]

    async def execute(
        self,
        session_id: str,
        code: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER,
    ) -> ExecutionResult:
        """
        在沙箱中执行代码。

        Args:
            session_id: 用户会话 ID
            code: 要执行的代码
            sandbox_type: 沙箱类型（用于自动启动）

        Returns:
            ExecutionResult 执行结果
        """
        info, sandbox = await self._get_or_start(session_id, sandbox_type)

        # 更新活动时间
        info.last_activity = datetime.utcnow()

        logger.info(f"Executing code in sandbox {info.sandbox_id}")
        start_time = time.time()

        try:
            # 执行代码
            execution = sandbox.run_code(
                code,
                timeout=sandbox_config.execution_timeout_secs,
            )

            execution_time_ms = int((time.time() - start_time) * 1000)

            # 收集 artifacts
            artifacts: list[str] = []
            if execution.results:
                for result in execution.results:
                    # E2B 返回的 result 可能包含图表等
                    if hasattr(result, "png") and result.png:
                        artifacts.append(f"data:image/png;base64,{result.png}")
                    elif hasattr(result, "url") and result.url:
                        artifacts.append(result.url)

            # 判断是否成功
            has_error = execution.error is not None

            return ExecutionResult(
                success=not has_error,
                output=execution.text or "",
                error=str(execution.error) if execution.error else None,
                execution_time_ms=execution_time_ms,
                artifacts=artifacts,
            )

        except TimeoutError as e:
            logger.error(f"Execution timeout in sandbox {info.sandbox_id}")
            raise SandboxTimeoutError(f"Execution timed out: {e}") from e
        except Exception as e:
            logger.error(f"Execution error in sandbox {info.sandbox_id}: {e}")
            raise SandboxExecutionError(f"Execution failed: {e}") from e

    async def upload(
        self,
        session_id: str,
        content: bytes,
        path: str,
    ) -> str:
        """
        上传文件到沙箱。

        Args:
            session_id: 用户会话 ID
            content: 文件内容
            path: 目标路径

        Returns:
            上传后的文件路径
        """
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.utcnow()

        try:
            sandbox.files.write(path, content)
            logger.info(f"Uploaded file to {path} in sandbox {info.sandbox_id}")
            return path
        except Exception as e:
            logger.error(f"Upload failed in sandbox {info.sandbox_id}: {e}")
            raise SandboxFileError(f"Upload failed: {e}") from e

    async def download(self, session_id: str, path: str) -> bytes:
        """
        从沙箱下载文件。

        Args:
            session_id: 用户会话 ID
            path: 文件路径

        Returns:
            文件内容
        """
        if session_id not in self._sandboxes:
            raise SandboxNotFoundError(session_id)

        info, sandbox = self._sandboxes[session_id]
        info.last_activity = datetime.utcnow()

        try:
            content = sandbox.files.read(path)
            logger.info(f"Downloaded file from {path} in sandbox {info.sandbox_id}")
            return content
        except Exception as e:
            logger.error(f"Download failed in sandbox {info.sandbox_id}: {e}")
            raise SandboxFileError(f"Download failed: {e}") from e

    async def list_files(self, session_id: str, path: str = "/home/user") -> list[FileInfo]:
        """
        列出沙箱中的文件。

        Args:
            session_id: 用户会话 ID
            path: 目录路径

        Returns:
            FileInfo 列表
        """
        if session_id not in self._sandboxes:
            raise SandboxNotFoundError(session_id)

        info, sandbox = self._sandboxes[session_id]
        info.last_activity = datetime.utcnow()

        try:
            files = sandbox.files.list(path)
            return [
                FileInfo(
                    path=f"{path}/{f.name}",
                    size=f.size if hasattr(f, "size") else 0,
                    is_directory=f.is_dir if hasattr(f, "is_dir") else False,
                )
                for f in files
            ]
        except Exception as e:
            logger.error(f"List files failed in sandbox {info.sandbox_id}: {e}")
            raise SandboxFileError(f"List files failed: {e}") from e

    async def install(
        self,
        session_id: str,
        packages: list[str],
    ) -> ExecutionResult:
        """
        在沙箱中安装 pip 包。

        Args:
            session_id: 用户会话 ID
            packages: 包名列表

        Returns:
            ExecutionResult 执行结果
        """
        if not packages:
            return ExecutionResult(success=True, output="No packages to install")

        packages_str = " ".join(packages)
        code = f"!pip install {packages_str}"

        logger.info(f"Installing packages in session {session_id}: {packages}")
        return await self.execute(session_id, code)

    async def cleanup_expired(self) -> int:
        """
        清理超时沙箱。

        Returns:
            清理的沙箱数量
        """
        now = datetime.utcnow()
        expired_sessions: list[str] = []

        async with self._lock:
            for session_id, (info, _) in self._sandboxes.items():
                # 检查最大存活时间
                lifetime = (now - info.created_at).total_seconds()
                if lifetime > sandbox_config.sandbox_max_lifetime_secs:
                    expired_sessions.append(session_id)
                    logger.info(f"Sandbox {info.sandbox_id} exceeded max lifetime")
                    continue

                # 检查空闲超时
                idle_time = (now - info.last_activity).total_seconds()
                if idle_time > sandbox_config.sandbox_idle_timeout_secs:
                    expired_sessions.append(session_id)
                    logger.info(f"Sandbox {info.sandbox_id} idle timeout")

        # 在锁外逐个关闭
        for session_id in expired_sessions:
            await self.stop(session_id)

        if expired_sessions:
            logger.info(f"Cleaned up {len(expired_sessions)} expired sandboxes")

        return len(expired_sessions)
```

**Step 4: 运行测试验证通过**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pytest tests/unit/test_sandbox/test_manager.py -v`
Expected: PASS (部分测试可能需要 mock E2B)

**Step 5: Commit**

```bash
git add service/app/sandbox/manager.py service/tests/unit/test_sandbox/test_manager.py
git commit -m "feat(sandbox): implement E2B sandbox manager"
```

---

## Task 6: 创建后台清理任务

**Files:**
- Create: `service/app/sandbox/cleanup_task.py`

**Step 1: 创建清理任务文件**

```python
# service/app/sandbox/cleanup_task.py
"""
Sandbox Cleanup Task

Background task for cleaning up expired sandboxes.
"""

import asyncio
import logging

from app.sandbox.manager import E2BSandboxManager

logger = logging.getLogger(__name__)

# 清理间隔（秒）
CLEANUP_INTERVAL = 60


async def start_cleanup_task() -> None:
    """启动后台清理任务"""
    logger.info("Starting sandbox cleanup task")

    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)

        try:
            manager = E2BSandboxManager.get_instance()
            count = await manager.cleanup_expired()

            if count > 0:
                logger.info(f"Cleaned up {count} expired sandboxes")

        except Exception as e:
            logger.error(f"Sandbox cleanup task error: {e}")
```

**Step 2: Commit**

```bash
git add service/app/sandbox/cleanup_task.py
git commit -m "feat(sandbox): add background cleanup task"
```

---

## Task 7: 更新模块导出

**Files:**
- Modify: `service/app/sandbox/__init__.py`

**Step 1: 重写 __init__.py**

```python
# service/app/sandbox/__init__.py
"""
E2B Sandbox Module

Provides cloud-native code execution via E2B.
"""

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
    ExecuteCodeRequest,
    ExecutionResult,
    FileInfo,
    InstallPackagesRequest,
    SandboxInfo,
    SandboxStatus,
    SandboxType,
    StartSandboxRequest,
)

__all__ = [
    # Manager
    "E2BSandboxManager",
    # Models
    "SandboxType",
    "SandboxStatus",
    "SandboxInfo",
    "ExecutionResult",
    "FileInfo",
    "StartSandboxRequest",
    "ExecuteCodeRequest",
    "InstallPackagesRequest",
    # Exceptions
    "SandboxError",
    "SandboxNotFoundError",
    "SandboxStartError",
    "SandboxExecutionError",
    "SandboxTimeoutError",
    "SandboxFileError",
]
```

**Step 2: Commit**

```bash
git add service/app/sandbox/__init__.py
git commit -m "refactor(sandbox): update module exports for E2B"
```

---

## Task 8: 重写 REST API

**Files:**
- Modify: `service/app/api/v1/sandbox.py`

**Step 1: 重写 API 文件**

```python
# service/app/api/v1/sandbox.py
"""
E2B Sandbox API

REST API endpoints for sandbox lifecycle and code execution.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.sandbox import (
    E2BSandboxManager,
    ExecuteCodeRequest,
    ExecutionResult,
    FileInfo,
    InstallPackagesRequest,
    SandboxInfo,
    SandboxNotFoundError,
    SandboxType,
    StartSandboxRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sandbox"])


# Response models
class SandboxStatusResponse(BaseModel):
    """沙箱状态响应"""

    exists: bool = Field(..., description="沙箱是否存在")
    info: SandboxInfo | None = Field(default=None, description="沙箱信息")


# Lifecycle endpoints
@router.post(
    "/sessions/{session_id}/sandbox/start",
    response_model=SandboxInfo,
    summary="启动沙箱",
    description="为指定 session 启动 E2B 沙箱，如已存在则返回现有实例",
)
async def start_sandbox(
    session_id: str,
    request: StartSandboxRequest | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> SandboxInfo:
    """启动沙箱"""
    logger.info(f"User {current_user} starting sandbox for session {session_id}")

    sandbox_type = request.sandbox_type if request else SandboxType.CODE_INTERPRETER

    try:
        manager = E2BSandboxManager.get_instance()
        return await manager.start(session_id, sandbox_type)
    except Exception as e:
        logger.error(f"Failed to start sandbox: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/sessions/{session_id}/sandbox/stop",
    summary="关停沙箱",
    description="关停指定 session 的沙箱",
)
async def stop_sandbox(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> dict[str, str]:
    """关停沙箱"""
    logger.info(f"User {current_user} stopping sandbox for session {session_id}")

    try:
        manager = E2BSandboxManager.get_instance()
        await manager.stop(session_id)
        return {"status": "stopped"}
    except Exception as e:
        logger.error(f"Failed to stop sandbox: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/sessions/{session_id}/sandbox/status",
    response_model=SandboxStatusResponse,
    summary="获取沙箱状态",
    description="获取指定 session 的沙箱状态",
)
async def get_sandbox_status(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> SandboxStatusResponse:
    """获取沙箱状态"""
    manager = E2BSandboxManager.get_instance()
    info = await manager.get(session_id)

    return SandboxStatusResponse(
        exists=info is not None,
        info=info,
    )


# Code execution
@router.post(
    "/sessions/{session_id}/sandbox/execute",
    response_model=ExecutionResult,
    summary="执行代码",
    description="在沙箱中执行 Python 代码，沙箱不存在则自动启动",
)
async def execute_code(
    session_id: str,
    request: ExecuteCodeRequest,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> ExecutionResult:
    """执行代码"""
    logger.info(f"User {current_user} executing code in session {session_id}")

    try:
        manager = E2BSandboxManager.get_instance()
        return await manager.execute(session_id, request.code)
    except Exception as e:
        logger.error(f"Execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# File operations
@router.post(
    "/sessions/{session_id}/sandbox/upload",
    response_model=FileInfo,
    summary="上传文件",
    description="上传文件到沙箱",
)
async def upload_file(
    session_id: str,
    file: UploadFile,
    path: str = "/home/user",
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> FileInfo:
    """上传文件到沙箱"""
    logger.info(f"User {current_user} uploading file to session {session_id}")

    try:
        content = await file.read()
        full_path = f"{path}/{file.filename}"

        manager = E2BSandboxManager.get_instance()
        await manager.upload(session_id, content, full_path)

        return FileInfo(
            path=full_path,
            size=len(content),
            is_directory=False,
        )
    except SandboxNotFoundError:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/sessions/{session_id}/sandbox/download",
    summary="下载文件",
    description="从沙箱下载文件",
)
async def download_file(
    session_id: str,
    path: str,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> StreamingResponse:
    """从沙箱下载文件"""
    logger.info(f"User {current_user} downloading file from session {session_id}")

    try:
        manager = E2BSandboxManager.get_instance()
        content = await manager.download(session_id, path)

        # 获取文件名
        filename = path.split("/")[-1]

        return StreamingResponse(
            iter([content]),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except SandboxNotFoundError:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/sessions/{session_id}/sandbox/files",
    response_model=list[FileInfo],
    summary="列出文件",
    description="列出沙箱中的文件",
)
async def list_files(
    session_id: str,
    path: str = "/home/user",
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> list[FileInfo]:
    """列出沙箱中的文件"""
    try:
        manager = E2BSandboxManager.get_instance()
        return await manager.list_files(session_id, path)
    except SandboxNotFoundError:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    except Exception as e:
        logger.error(f"List files failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Environment management
@router.post(
    "/sessions/{session_id}/sandbox/install",
    response_model=ExecutionResult,
    summary="安装依赖",
    description="在沙箱中安装 pip 依赖包",
)
async def install_packages(
    session_id: str,
    request: InstallPackagesRequest,
    db: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> ExecutionResult:
    """安装 pip 依赖"""
    logger.info(f"User {current_user} installing packages in session {session_id}")

    try:
        manager = E2BSandboxManager.get_instance()
        return await manager.install(session_id, request.packages)
    except SandboxNotFoundError:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    except Exception as e:
        logger.error(f"Install failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 2: 更新路由前缀**

修改 `service/app/api/v1/__init__.py`，更新 sandbox router 的注册：

```python
# 找到这行并修改
# v1_router.include_router(sandbox_router, prefix="/sandbox")
# 改为:
v1_router.include_router(sandbox_router)  # 路由前缀已在 sandbox.py 中定义
```

**Step 3: Commit**

```bash
git add service/app/api/v1/sandbox.py service/app/api/v1/__init__.py
git commit -m "refactor(sandbox): rewrite REST API for E2B integration"
```

---

## Task 9: 重写 LangChain Tool

**Files:**
- Modify: `service/app/tools/code_executor.py`

**Step 1: 重写 Tool 文件**

```python
# service/app/tools/code_executor.py
"""
E2B Code Executor Tools

LangChain tools for code execution in E2B sandbox.
"""

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.sandbox import E2BSandboxManager, ExecutionResult

logger = logging.getLogger(__name__)


class CodeExecuteInput(BaseModel):
    """代码执行输入"""

    code: str = Field(description="要执行的 Python 代码")


class InstallPackageInput(BaseModel):
    """安装依赖输入"""

    packages: list[str] = Field(description="要安装的 pip 包列表")


def _get_session_id_from_config(config: RunnableConfig | None) -> str:
    """从 RunnableConfig 中提取 session_id"""
    if config and "configurable" in config:
        session_id = config["configurable"].get("session_id")
        if session_id:
            return str(session_id)

    # 降级：使用默认 session
    logger.warning("No session_id in config, using default")
    return "default_session"


async def _execute_code(code: str, config: RunnableConfig | None = None) -> dict[str, Any]:
    """在沙箱中执行 Python 代码"""
    session_id = _get_session_id_from_config(config)
    logger.info(f"Executing code in session {session_id}")

    manager = E2BSandboxManager.get_instance()
    result: ExecutionResult = await manager.execute(session_id, code)

    return result.model_dump()


async def _install_packages(
    packages: list[str], config: RunnableConfig | None = None
) -> dict[str, Any]:
    """在沙箱中安装 pip 依赖"""
    session_id = _get_session_id_from_config(config)
    logger.info(f"Installing packages {packages} in session {session_id}")

    manager = E2BSandboxManager.get_instance()
    result: ExecutionResult = await manager.install(session_id, packages)

    return result.model_dump()


def create_sandbox_tools() -> list[StructuredTool]:
    """创建沙箱相关工具"""
    return [
        StructuredTool(
            name="execute_python",
            description=(
                "在云端沙箱中执行 Python 代码。"
                "支持数据分析、文件处理、图表生成等。"
                "沙箱环境预装了常用库如 pandas、numpy、matplotlib。"
                "执行结果包含标准输出和生成的图表/文件。"
            ),
            args_schema=CodeExecuteInput,
            coroutine=_execute_code,
        ),
        StructuredTool(
            name="install_packages",
            description=(
                "在沙箱中安装 Python 依赖包。"
                "使用 pip install 安装指定的包。"
                "安装后的包在整个会话期间可用。"
            ),
            args_schema=InstallPackageInput,
            coroutine=_install_packages,
        ),
    ]


def register_sandbox_tools() -> None:
    """注册沙箱工具到内置工具注册表"""
    from app.tools.registry import BuiltinToolRegistry

    tools = create_sandbox_tools()
    for tool in tools:
        BuiltinToolRegistry.register(
            tool_id=tool.name,
            tool=tool,
            category="code_execution",
            display_name=tool.name.replace("_", " ").title(),
        )

    logger.info(f"Registered {len(tools)} sandbox tools")
```

**Step 2: Commit**

```bash
git add service/app/tools/code_executor.py
git commit -m "refactor(sandbox): rewrite LangChain tools for E2B"
```

---

## Task 10: 注册清理任务到 FastAPI

**Files:**
- Modify: `service/app/main.py` (或应用启动文件)

**Step 1: 找到应用启动文件并添加清理任务**

在 FastAPI 应用的 startup 事件中添加：

```python
import asyncio
from app.sandbox.cleanup_task import start_cleanup_task

@app.on_event("startup")
async def startup_event():
    # ... 其他启动逻辑 ...

    # 启动沙箱清理任务
    asyncio.create_task(start_cleanup_task())
```

**Step 2: Commit**

```bash
git add service/app/main.py
git commit -m "feat(sandbox): register cleanup task on startup"
```

---

## Task 11: 删除旧代码

**Files:**
- Delete: `service/app/sandbox/backends/` (整个目录)
- Delete: `service/app/sandbox/resource_limits.py`
- Delete: `service/app/sandbox/result.py`
- Delete: `service/app/sandbox/executor.py`
- Delete: `service/tests/unit/test_sandbox/test_resource_limits.py`
- Delete: `service/tests/unit/test_sandbox/test_result.py`

**Step 1: 删除旧文件**

```bash
rm -rf service/app/sandbox/backends
rm -f service/app/sandbox/resource_limits.py
rm -f service/app/sandbox/result.py
rm -f service/app/sandbox/executor.py
rm -f service/tests/unit/test_sandbox/test_resource_limits.py
rm -f service/tests/unit/test_sandbox/test_result.py
```

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor(sandbox): remove legacy sandbox implementation"
```

---

## Task 12: 更新测试 __init__.py

**Files:**
- Modify: `service/tests/unit/test_sandbox/__init__.py`

**Step 1: 清空或更新测试初始化文件**

```python
# service/tests/unit/test_sandbox/__init__.py
"""E2B Sandbox Tests"""
```

**Step 2: Commit**

```bash
git add service/tests/unit/test_sandbox/__init__.py
git commit -m "test(sandbox): update test module init"
```

---

## Task 13: 运行完整测试

**Step 1: 运行所有测试**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pytest tests/ -v --ignore=tests/integration`
Expected: PASS (或跳过需要 E2B API key 的测试)

**Step 2: 运行类型检查**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && pyright`
Expected: 无错误

**Step 3: 运行 linter**

Run: `cd /Users/phelan/develop/xyzen/Xyzen/service && ruff check .`
Expected: 无错误

---

## Task 14: 更新设计文档状态

**Files:**
- Modify: `docs/plans/2026-01-22-e2b-sandbox-design.md`

**Step 1: 更新文档状态**

将文档头部的状态从 `待实施` 改为 `已完成`：

```markdown
> 日期：2026-01-22
> 状态：已完成
```

**Step 2: Final Commit**

```bash
git add docs/plans/2026-01-22-e2b-sandbox-design.md
git commit -m "docs: mark E2B sandbox design as completed"
```

---

## 环境变量清单

实施完成后，需要在环境中配置以下变量：

```bash
# .env 或环境变量
XYZEN_SANDBOX_E2B_API_KEY=your_e2b_api_key_here
XYZEN_SANDBOX_DEFAULT_SANDBOX_TYPE=code_interpreter
XYZEN_SANDBOX_CUSTOM_TEMPLATE_ID=  # 可选，用于 custom sandbox
XYZEN_SANDBOX_EXECUTION_TIMEOUT_SECS=300
XYZEN_SANDBOX_SANDBOX_IDLE_TIMEOUT_SECS=1800
XYZEN_SANDBOX_SANDBOX_MAX_LIFETIME_SECS=7200
```
