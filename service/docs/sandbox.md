# Sandbox 沙箱模块

本模块提供安全的代码执行环境，支持多语言代码执行和资源限制。

## 架构

```
app/sandbox/
├── __init__.py              # 模块导出
├── executor.py              # 主执行器（带缓存）
├── result.py                # 执行结果模型
├── resource_limits.py       # 资源限制配置
└── backends/
    ├── base.py              # 抽象后端接口
    ├── subprocess_backend.py # 子进程后端
    └── container_backend.py  # Docker容器后端
```

## 快速开始

### 基本使用

```python
from app.sandbox import SandboxExecutor

async with SandboxExecutor() as executor:
    result = await executor.execute(
        code="print('Hello, World!')",
        language="python"
    )
    print(result.output_str)  # Hello, World!
```

### 自定义资源限制

```python
from app.sandbox import SandboxExecutor, ResourceLimits

limits = ResourceLimits(
    memory_bytes=128 * 1024 * 1024,  # 128MB
    cpu_time_ms=10000,               # 10秒
    wall_time_ms=15000,              # 15秒
)

async with SandboxExecutor(limits=limits) as executor:
    result = await executor.execute(code="...", language="python")
```

### 执行函数

```python
async with SandboxExecutor() as executor:
    result = await executor.execute_with_function(
        code="def add(a, b): return a + b",
        function_name="add",
        args=(1, 2),
    )
    # 解析 result.output_str 获取返回值
```

## 支持的语言

| 语言 | 标识符 | 说明 |
|------|--------|------|
| Python | `python` | Python 3.x |
| JavaScript | `javascript` | Node.js |
| Bash | `bash` | Shell脚本 |

## 资源限制

默认配置（可通过环境变量覆盖）：

| 配置项 | 默认值 | 环境变量 |
|--------|--------|----------|
| 内存限制 | 256MB | `SANDBOX_MAX_MEMORY_MB` |
| CPU时间 | 30秒 | `SANDBOX_MAX_CPU_TIME_SECS` |
| 墙钟时间 | 60秒 | `SANDBOX_MAX_WALL_TIME_SECS` |
| 文件大小 | 10MB | `SANDBOX_MAX_FILE_SIZE_MB` |
| 进程数 | 10 | `SANDBOX_MAX_PROCESSES` |

## 后端选择

通过 `SANDBOX_BACKEND` 环境变量配置：

- `subprocess`（默认）: 本地子进程执行，使用 rlimit 限制资源（仅Linux）
- `docker`: Docker容器隔离执行
- `kubernetes`: Kubernetes Pod执行（未完全实现）

## API 端点

### POST /api/v1/sandbox/execute

执行代码并返回结果。

**请求体：**
```json
{
    "code": "print('hello')",
    "language": "python",
    "stdin": "",
    "timeout_secs": 30
}
```

**响应：**
```json
{
    "success": true,
    "output": "hello\n",
    "stderr": null,
    "exit_code": 0,
    "duration_ms": 45,
    "error": null
}
```

### POST /api/v1/sandbox/execute-function

执行代码中的指定函数。

**请求体：**
```json
{
    "code": "def add(a, b): return a + b",
    "function_name": "add",
    "args": [1, 2],
    "kwargs": {}
}
```

**响应：**
```json
{
    "success": true,
    "result": 3,
    "error": null,
    "traceback": null
}
```

## 安全注意事项

1. **资源限制**：始终设置合理的资源限制，防止恶意代码耗尽系统资源
2. **网络隔离**：容器后端建议配置网络隔离
3. **文件系统**：代码在临时目录执行，执行完成后自动清理
4. **权限控制**：API端点需要用户认证

