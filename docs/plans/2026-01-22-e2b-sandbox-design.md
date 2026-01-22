# E2B 沙箱替换设计文档

> 日期：2026-01-22
> 状态：待实施

## 概述

将现有沙箱实现完全替换为 E2B 云原生沙箱，实现高度自由、功能化的容器化代码执行支持。

## 需求总结

| 需求项 | 决策 |
|--------|------|
| 替换范围 | 完全替换，移除所有现有后端 |
| 支持语言 | 仅 Python |
| 沙箱类型 | Code Interpreter + Custom Sandbox |
| 生命周期 | 会话保持，一个 Session 一个沙箱 |
| 控制方式 | 显式启动/关停 API |
| 交互功能 | 代码执行 + 文件操作 + 安装依赖 |
| 资源限制 | 全局配置 |
| 安全检查 | 移除（信任 E2B 隔离） |
| 结果缓存 | 移除 |

## 架构设计

### 目录结构

```
service/app/sandbox/
├── __init__.py              # 导出公共接口
├── manager.py               # E2BSandboxManager - 核心管理器
├── models.py                # Pydantic 模型定义
├── exceptions.py            # 自定义异常
└── cleanup_task.py          # 后台清理任务

service/app/api/v1/sandbox.py    # REST API 端点
service/app/tools/code_executor.py  # LangChain Tool
service/app/configs/sandbox.py      # 配置
```

### 数据模型

```python
# sandbox/models.py

from enum import Enum
from pydantic import BaseModel, Field
from datetime import datetime

class SandboxType(str, Enum):
    """沙箱类型"""
    CODE_INTERPRETER = "code_interpreter"  # E2B 预置环境
    CUSTOM = "custom"                       # 自定义镜像

class SandboxStatus(str, Enum):
    """沙箱状态"""
    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"

class SandboxInfo(BaseModel):
    """沙箱实例信息"""
    sandbox_id: str                # E2B 返回的沙箱 ID
    session_id: str                # 关联的用户会话 ID
    sandbox_type: SandboxType
    status: SandboxStatus
    created_at: datetime
    last_activity: datetime        # 用于超时清理

class ExecutionResult(BaseModel):
    """代码执行结果"""
    success: bool
    output: str = ""               # stdout
    error: str | None = None       # stderr 或异常信息
    execution_time_ms: int = 0
    artifacts: list[str] = Field(default_factory=list)  # 生成的文件/图表

class FileInfo(BaseModel):
    """文件信息"""
    path: str
    size: int
    is_directory: bool
```

### 配置

```python
# configs/sandbox.py

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

### REST API

```python
# api/v1/sandbox.py

router = APIRouter(prefix="/session/{session_id}/sandbox", tags=["Sandbox"])

# 生命周期管理
POST /session/{session_id}/sandbox/start    # 启动沙箱
POST /session/{session_id}/sandbox/stop     # 关停沙箱
GET  /session/{session_id}/sandbox/status   # 获取状态

# 代码执行
POST /session/{session_id}/sandbox/execute  # 执行代码（沙箱不存在则自动启动）

# 文件操作
POST /session/{session_id}/sandbox/upload   # 上传文件
GET  /session/{session_id}/sandbox/download # 下载文件
GET  /session/{session_id}/sandbox/files    # 列出文件

# 环境管理
POST /session/{session_id}/sandbox/install  # 安装依赖包
```

### 核心管理器

```python
# sandbox/manager.py

from e2b_code_interpreter import Sandbox as CodeInterpreter
from e2b import Sandbox as CustomSandbox

class E2BSandboxManager:
    """E2B 沙箱管理器 - 单例"""

    _instance: "E2BSandboxManager | None" = None

    def __init__(self):
        self._sandboxes: dict[str, tuple[SandboxInfo, Any]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "E2BSandboxManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start(
        self,
        session_id: str,
        sandbox_type: SandboxType = SandboxType.CODE_INTERPRETER
    ) -> SandboxInfo:
        """启动沙箱，已存在则返回现有实例"""
        async with self._lock:
            if session_id in self._sandboxes:
                info, _ = self._sandboxes[session_id]
                return info

            if sandbox_type == SandboxType.CODE_INTERPRETER:
                sandbox = CodeInterpreter(timeout=config.sandbox_max_lifetime_secs)
            else:
                sandbox = CustomSandbox(
                    template=config.custom_template_id,
                    timeout=config.sandbox_max_lifetime_secs
                )

            info = SandboxInfo(
                sandbox_id=sandbox.id,
                session_id=session_id,
                sandbox_type=sandbox_type,
                status=SandboxStatus.RUNNING,
                created_at=datetime.utcnow(),
                last_activity=datetime.utcnow(),
            )
            self._sandboxes[session_id] = (info, sandbox)
            return info

    async def stop(self, session_id: str) -> None:
        """关停沙箱"""
        async with self._lock:
            if session_id not in self._sandboxes:
                return
            info, sandbox = self._sandboxes.pop(session_id)
            info.status = SandboxStatus.STOPPED
            sandbox.close()

    async def execute(self, session_id: str, code: str) -> ExecutionResult:
        """执行代码"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.utcnow()

        result = sandbox.run_code(code, timeout=config.execution_timeout_secs)

        return ExecutionResult(
            success=result.error is None,
            output=result.text or "",
            error=result.error,
            artifacts=[a.url for a in result.artifacts] if result.artifacts else [],
        )

    async def upload(self, session_id: str, content: bytes, path: str) -> str:
        """上传文件到沙箱"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.utcnow()
        sandbox.files.write(path, content)
        return path

    async def download(self, session_id: str, path: str) -> bytes:
        """从沙箱下载文件"""
        info, sandbox = await self._get_or_start(session_id)
        info.last_activity = datetime.utcnow()
        return sandbox.files.read(path)

    async def install(self, session_id: str, packages: list[str]) -> ExecutionResult:
        """安装 pip 包"""
        code = f"import subprocess; subprocess.run(['pip', 'install'] + {packages!r}, check=True)"
        return await self.execute(session_id, code)

    async def cleanup_expired(self) -> int:
        """清理超时沙箱"""
        now = datetime.utcnow()
        expired_sessions: list[str] = []

        async with self._lock:
            for session_id, (info, _) in self._sandboxes.items():
                lifetime = (now - info.created_at).total_seconds()
                if lifetime > config.sandbox_max_lifetime_secs:
                    expired_sessions.append(session_id)
                    continue

                idle_time = (now - info.last_activity).total_seconds()
                if idle_time > config.sandbox_idle_timeout_secs:
                    expired_sessions.append(session_id)

        for session_id in expired_sessions:
            await self.stop(session_id)

        return len(expired_sessions)
```

### LangChain Tool

```python
# tools/code_executor.py

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

class CodeExecuteInput(BaseModel):
    code: str = Field(description="要执行的 Python 代码")

class InstallPackageInput(BaseModel):
    packages: list[str] = Field(description="要安装的 pip 包列表")

async def _execute_code(code: str) -> dict:
    session_id = get_current_session_id()
    manager = E2BSandboxManager.get_instance()
    result = await manager.execute(session_id, code)
    return result.model_dump()

async def _install_packages(packages: list[str]) -> dict:
    session_id = get_current_session_id()
    manager = E2BSandboxManager.get_instance()
    result = await manager.install(session_id, packages)
    return result.model_dump()

def create_sandbox_tools() -> list[StructuredTool]:
    return [
        StructuredTool(
            name="execute_python",
            description="在沙箱中执行 Python 代码。支持数据分析、文件处理、图表生成等。",
            args_schema=CodeExecuteInput,
            coroutine=_execute_code,
        ),
        StructuredTool(
            name="install_packages",
            description="在沙箱中安装 Python 依赖包。",
            args_schema=InstallPackageInput,
            coroutine=_install_packages,
        ),
    ]
```

### 后台清理任务

```python
# sandbox/cleanup_task.py

async def start_cleanup_task():
    """启动后台清理任务"""
    while True:
        await asyncio.sleep(60)
        try:
            manager = E2BSandboxManager.get_instance()
            count = await manager.cleanup_expired()
            if count > 0:
                logger.info(f"清理了 {count} 个超时沙箱")
        except Exception as e:
            logger.error(f"清理任务异常: {e}")

# FastAPI 启动时注册
@app.on_event("startup")
async def startup():
    asyncio.create_task(start_cleanup_task())
```

## 迁移清单

### 删除的文件

```
service/app/sandbox/
├── backends/                    # 整个目录
│   ├── __init__.py
│   ├── base.py
│   ├── container_backend.py
│   └── subprocess_backend.py
├── resource_limits.py
└── result.py

service/tests/unit/test_sandbox/
├── test_resource_limits.py
└── test_result.py
```

### 修改的文件

```
service/app/sandbox/__init__.py
service/app/configs/sandbox.py
service/app/configs/__init__.py
service/app/api/v1/sandbox.py
service/app/api/v1/__init__.py
service/app/tools/code_executor.py
service/app/agents/graph_builder.py
service/requirements.txt
```

### 新增的文件

```
service/app/sandbox/manager.py
service/app/sandbox/models.py
service/app/sandbox/exceptions.py
service/app/sandbox/cleanup_task.py
```

### 依赖变更

```diff
- llm-sandbox
+ e2b
+ e2b-code-interpreter
```

## 环境变量

```bash
E2B_API_KEY=your_e2b_api_key
SANDBOX_DEFAULT_TYPE=code_interpreter
SANDBOX_CUSTOM_TEMPLATE_ID=your_template_id  # 可选
SANDBOX_EXECUTION_TIMEOUT_SECS=300
SANDBOX_IDLE_TIMEOUT_SECS=1800
SANDBOX_MAX_LIFETIME_SECS=7200
```
