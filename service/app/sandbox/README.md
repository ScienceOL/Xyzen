# E2B 沙箱服务对接文档

> 版本: 1.0.0
> 更新时间: 2026-01-22
> 基于真实测试数据编写

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [API 端点](#api-端点)
  - [启动沙箱](#1-启动沙箱)
  - [关闭沙箱](#2-关闭沙箱)
  - [获取状态](#3-获取状态)
  - [执行代码](#4-执行代码)
  - [安装依赖](#5-安装依赖)
  - [上传文件](#6-上传文件)
  - [下载文件](#7-下载文件)
  - [列出文件](#8-列出文件)
- [数据模型](#数据模型)
- [错误处理](#错误处理)
- [使用场景示例](#使用场景示例)
- [前端集成指南](#前端集成指南)
- [测试指南](#测试指南)
- [常见问题](#常见问题)

---

## 概述

E2B 沙箱是一个云原生的代码执行环境，为每个用户会话提供独立、安全的 Python 运行时。

### 核心特性

| 特性 | 说明 |
|------|------|
| **会话隔离** | 每个 `session_id` 对应独立的沙箱实例 |
| **状态保持** | 同一会话内的代码执行共享变量和状态 |
| **依赖安装** | 支持在线安装任意 pip 包 |
| **文件操作** | 支持上传、下载、列出文件 |
| **自动清理** | 空闲超时自动关闭，最大存活 1 小时 |

### 技术限制

| 限制项 | 值 |
|--------|-----|
| 单次执行超时 | 300 秒 (5 分钟) |
| 空闲超时 | 1800 秒 (30 分钟) |
| 最大存活时间 | 3600 秒 (1 小时) |
| 支持语言 | 仅 Python |

---

## 快速开始

### 基本流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  启动沙箱   │ ──▶ │  执行代码   │ ──▶ │  获取结果   │ ──▶ │  关闭沙箱   │
│  POST /start│     │POST /execute│     │   (响应)    │     │ POST /stop  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 最小示例

```javascript
// 1. 启动沙箱（可选，执行代码时会自动启动）
const startRes = await fetch('/api/v1/session/my-session/sandbox/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sandbox_type: 'code_interpreter' })
});

// 2. 执行代码
const execRes = await fetch('/api/v1/session/my-session/sandbox/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'print("Hello, World!")' })
});
const result = await execRes.json();
// { "success": true, "output": "Hello, World!\n", "error": null, ... }

// 3. 关闭沙箱（可选，会自动超时清理）
await fetch('/api/v1/session/my-session/sandbox/stop', { method: 'POST' });
```

---

## API 端点

**基础路径**: `/api/v1/session/{session_id}/sandbox`

> `session_id` 是用户会话的唯一标识，由前端生成或从登录态获取。

---

### 1. 启动沙箱

启动一个新的沙箱实例。如果该会话已有沙箱，返回现有实例。

**请求**

```http
POST /api/v1/session/{session_id}/sandbox/start
Content-Type: application/json

{
  "sandbox_type": "code_interpreter"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sandbox_type` | string | 否 | 沙箱类型，默认 `code_interpreter` |

**响应** `200 OK`

```json
{
  "sandbox_id": "i3vf9pg2fp92io4hhv4il",
  "session_id": "doc_test_session",
  "sandbox_type": "code_interpreter",
  "status": "running",
  "created_at": "2026-01-22T15:06:11.971102+00:00",
  "last_activity": "2026-01-22T15:06:11.971102+00:00"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `sandbox_id` | string | E2B 沙箱唯一 ID |
| `session_id` | string | 关联的用户会话 ID |
| `sandbox_type` | string | 沙箱类型 |
| `status` | string | 状态: `starting`, `running`, `stopped`, `error` |
| `created_at` | datetime | 创建时间 (ISO 8601) |
| `last_activity` | datetime | 最后活动时间 |

---

### 2. 关闭沙箱

关闭指定会话的沙箱。

**请求**

```http
POST /api/v1/session/{session_id}/sandbox/stop
```

**响应** `204 No Content`

无响应体。

---

### 3. 获取状态

获取沙箱当前状态。

**请求**

```http
GET /api/v1/session/{session_id}/sandbox/status
```

**响应** `200 OK`

沙箱存在时：
```json
{
  "sandbox_id": "i3vf9pg2fp92io4hhv4il",
  "session_id": "doc_test_session",
  "sandbox_type": "code_interpreter",
  "status": "running",
  "created_at": "2026-01-22T15:06:11.971102+00:00",
  "last_activity": "2026-01-22T15:06:11.971102+00:00"
}
```

沙箱不存在时：
```json
null
```

---

### 4. 执行代码

在沙箱中执行 Python 代码。**如果沙箱不存在，会自动启动**。

**请求**

```http
POST /api/v1/session/{session_id}/sandbox/execute
Content-Type: application/json

{
  "code": "print(\"Hello, World!\")"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | 是 | 要执行的 Python 代码 |

**响应** `200 OK`

成功示例：
```json
{
  "success": true,
  "output": "Hello, World!\n",
  "error": null,
  "execution_time_ms": 0,
  "artifacts": []
}
```

复杂数据处理示例：

请求：
```json
{
  "code": "import json\ndata = {\"users\": [{\"name\": \"Alice\", \"age\": 30}, {\"name\": \"Bob\", \"age\": 25}]}\ntotal_age = sum(user[\"age\"] for user in data[\"users\"])\navg_age = total_age / len(data[\"users\"])\nprint(f\"Total age: {total_age}\")\nprint(f\"Average age: {avg_age}\")\nprint(json.dumps(data, indent=2))"
}
```

响应：
```json
{
  "success": true,
  "output": "Total age: 55\nAverage age: 27.5\n{\n  \"users\": [\n    {\n      \"name\": \"Alice\",\n      \"age\": 30\n    },\n    {\n      \"name\": \"Bob\",\n      \"age\": 25\n    }\n  ]\n}\n",
  "error": null,
  "execution_time_ms": 0,
  "artifacts": []
}
```

错误示例：
```json
{
  "success": false,
  "output": "",
  "error": "ExecutionError(name='NameError', value=\"name 'undefined_variable' is not defined\", traceback=\"---------------------------------------------------------------------------NameError                                 Traceback (most recent call last)Cell In[3], line 1\\n----> 1 undefined_variable\\nNameError: name 'undefined_variable' is not defined\")",
  "execution_time_ms": 0,
  "artifacts": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 执行是否成功 |
| `output` | string | 标准输出 (stdout) |
| `error` | string \| null | 错误信息 (stderr 或异常) |
| `execution_time_ms` | integer | 执行耗时 (毫秒) |
| `artifacts` | array | 生成的文件/图表 URL 列表 |

---

### 5. 安装依赖

在沙箱中安装 pip 包。

**请求**

```http
POST /api/v1/session/{session_id}/sandbox/install
Content-Type: application/json

{
  "packages": ["requests", "pandas"]
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `packages` | string[] | 是 | pip 包名列表 |

**响应** `200 OK`

```json
{
  "success": true,
  "output": "...",
  "error": null,
  "execution_time_ms": 0,
  "artifacts": []
}
```

安装后可直接使用：
```json
// 执行代码
{ "code": "import requests\nprint(f\"requests version: {requests.__version__}\")" }

// 响应
{
  "success": true,
  "output": "requests version: 2.32.4\n",
  "error": null,
  "execution_time_ms": 0,
  "artifacts": []
}
```

---

### 6. 上传文件

上传文件到沙箱。

**请求**

```http
POST /api/v1/session/{session_id}/sandbox/upload?path=/home/user/upload
Content-Type: multipart/form-data

file: (binary)
```

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `file` | file | body | 是 | 要上传的文件 |
| `path` | string | query | 否 | 目标目录，默认 `/home/user/upload` |

**响应** `200 OK`

```json
{
  "path": "/home/user/upload/data.json"
}
```

---

### 7. 下载文件

从沙箱下载文件。

**请求**

```http
GET /api/v1/session/{session_id}/sandbox/download?path=/home/user/data.json
```

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `path` | string | query | 是 | 文件完整路径 |

**响应** `200 OK`

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="data.json"

{"message": "Hello from API", "timestamp": 1234567890}
```

---

### 8. 列出文件

列出沙箱中指定目录的文件。

**请求**

```http
GET /api/v1/session/{session_id}/sandbox/files?path=/home/user
```

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `path` | string | query | 否 | 目录路径，默认 `/` |

**响应** `200 OK`

```json
[
  {
    "path": "/home/user/.bash_logout",
    "size": 220,
    "is_directory": false
  },
  {
    "path": "/home/user/.bashrc",
    "size": 3526,
    "is_directory": false
  },
  {
    "path": "/home/user/.profile",
    "size": 807,
    "is_directory": false
  },
  {
    "path": "/home/user/data.json",
    "size": 54,
    "is_directory": false
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件完整路径 |
| `size` | integer | 文件大小 (字节) |
| `is_directory` | boolean | 是否为目录 |

---

## 数据模型

### SandboxType (沙箱类型)

```typescript
type SandboxType = "code_interpreter" | "custom";
```

| 值 | 说明 |
|----|------|
| `code_interpreter` | E2B 预置 Python 环境 (推荐) |
| `custom` | 自定义镜像 (需配置 template_id) |

### SandboxStatus (沙箱状态)

```typescript
type SandboxStatus = "starting" | "running" | "stopped" | "error";
```

| 状态 | 说明 |
|------|------|
| `starting` | 正在启动 |
| `running` | 运行中，可执行代码 |
| `stopped` | 已停止 |
| `error` | 出错 |

### SandboxInfo (沙箱信息)

```typescript
interface SandboxInfo {
  sandbox_id: string;      // E2B 沙箱 ID
  session_id: string;      // 用户会话 ID
  sandbox_type: SandboxType;
  status: SandboxStatus;
  created_at: string;      // ISO 8601 时间
  last_activity: string;   // ISO 8601 时间
}
```

### ExecutionResult (执行结果)

```typescript
interface ExecutionResult {
  success: boolean;        // 是否成功
  output: string;          // 标准输出
  error: string | null;    // 错误信息
  execution_time_ms: number;
  artifacts: string[];     // 生成的文件 URL
}
```

### FileInfo (文件信息)

```typescript
interface FileInfo {
  path: string;            // 文件路径
  size: number;            // 文件大小 (字节)
  is_directory: boolean;   // 是否为目录
}
```

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| `200` | 成功 |
| `204` | 成功，无响应体 |
| `400` | 请求参数错误 |
| `404` | 资源不存在 (如文件不存在) |
| `408` | 执行超时 |
| `500` | 服务器内部错误 |

### 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `session_id not found` | 无效的会话 ID | 检查 session_id 是否正确 |
| `Sandbox execution failed` | 代码执行出错 | 检查 `error` 字段获取详情 |
| `Timeout` | 执行超时 | 优化代码或分批执行 |
| `File not found` | 文件不存在 | 检查文件路径 |

---

## 使用场景示例

### 场景 1: 数据分析

```javascript
// 1. 安装数据分析库
await fetch('/api/v1/session/s1/sandbox/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ packages: ['pandas', 'matplotlib'] })
});

// 2. 上传数据文件
const formData = new FormData();
formData.append('file', csvFile);
await fetch('/api/v1/session/s1/sandbox/upload?path=/home/user', {
  method: 'POST',
  body: formData
});

// 3. 执行分析代码
const result = await fetch('/api/v1/session/s1/sandbox/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: `
import pandas as pd
df = pd.read_csv('/home/user/data.csv')
print(df.describe())
print(f"行数: {len(df)}")
    `
  })
}).then(r => r.json());

console.log(result.output);
```

### 场景 2: 状态保持的交互式编程

```javascript
// 第一次执行：定义变量
await execute(sessionId, 'x = 10');

// 第二次执行：使用之前定义的变量
await execute(sessionId, 'y = x * 2');

// 第三次执行：变量仍然存在
const result = await execute(sessionId, 'print(f"x={x}, y={y}")');
// output: "x=10, y=20"
```

### 场景 3: 生成图表

```javascript
const result = await execute(sessionId, `
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y = np.sin(x)

plt.figure(figsize=(10, 6))
plt.plot(x, y)
plt.title('Sine Wave')
plt.savefig('/home/user/chart.png')
print('Chart saved!')
`);

// 下载生成的图表
const chartBlob = await fetch(
  `/api/v1/session/${sessionId}/sandbox/download?path=/home/user/chart.png`
).then(r => r.blob());
```

---

## 前端集成指南

### TypeScript 类型定义

```typescript
// types/sandbox.ts

export type SandboxType = "code_interpreter" | "custom";
export type SandboxStatus = "starting" | "running" | "stopped" | "error";

export interface SandboxInfo {
  sandbox_id: string;
  session_id: string;
  sandbox_type: SandboxType;
  status: SandboxStatus;
  created_at: string;
  last_activity: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string | null;
  execution_time_ms: number;
  artifacts: string[];
}

export interface FileInfo {
  path: string;
  size: number;
  is_directory: boolean;
}

export interface StartSandboxRequest {
  sandbox_type?: SandboxType;
}

export interface ExecuteCodeRequest {
  code: string;
}

export interface InstallPackagesRequest {
  packages: string[];
}
```

### API 封装示例

```typescript
// api/sandbox.ts

const BASE_URL = '/api/v1';

export class SandboxAPI {
  constructor(private sessionId: string) {}

  private get baseUrl() {
    return `${BASE_URL}/session/${this.sessionId}/sandbox`;
  }

  async start(type: SandboxType = 'code_interpreter'): Promise<SandboxInfo> {
    const res = await fetch(`${this.baseUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox_type: type })
    });
    return res.json();
  }

  async stop(): Promise<void> {
    await fetch(`${this.baseUrl}/stop`, { method: 'POST' });
  }

  async getStatus(): Promise<SandboxInfo | null> {
    const res = await fetch(`${this.baseUrl}/status`);
    return res.json();
  }

  async execute(code: string): Promise<ExecutionResult> {
    const res = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    return res.json();
  }

  async install(packages: string[]): Promise<ExecutionResult> {
    const res = await fetch(`${this.baseUrl}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages })
    });
    return res.json();
  }

  async upload(file: File, path: string = '/home/user/upload'): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${this.baseUrl}/upload?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  }

  async download(path: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/download?path=${encodeURIComponent(path)}`);
    return res.blob();
  }

  async listFiles(path: string = '/'): Promise<FileInfo[]> {
    const res = await fetch(`${this.baseUrl}/files?path=${encodeURIComponent(path)}`);
    return res.json();
  }
}

// 使用示例
const sandbox = new SandboxAPI('my-session-id');
const result = await sandbox.execute('print("Hello!")');
```

### React Hook 示例

```typescript
// hooks/useSandbox.ts

import { useState, useCallback } from 'react';
import { SandboxAPI, ExecutionResult, SandboxInfo } from '../api/sandbox';

export function useSandbox(sessionId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SandboxInfo | null>(null);

  const api = new SandboxAPI(sessionId);

  const execute = useCallback(async (code: string): Promise<ExecutionResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.execute(code);
      if (!result.success) {
        setError(result.error);
      }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const refreshStatus = useCallback(async () => {
    const s = await api.getStatus();
    setStatus(s);
    return s;
  }, [sessionId]);

  return {
    execute,
    refreshStatus,
    loading,
    error,
    status,
    api
  };
}
```

---

## 测试指南

### 测试用例清单

| 测试场景 | 预期结果 |
|----------|----------|
| 启动沙箱 | 返回 `status: "running"` |
| 重复启动同一会话 | 返回相同的 `sandbox_id` |
| 执行简单代码 | `success: true`, `output` 包含结果 |
| 执行错误代码 | `success: false`, `error` 包含错误信息 |
| 状态保持 | 后续执行可访问之前定义的变量 |
| 安装依赖 | 安装后可 import 该包 |
| 上传文件 | 返回文件路径 |
| 下载文件 | 返回文件内容 |
| 列出文件 | 返回文件列表，包含已上传的文件 |
| 关闭沙箱 | 返回 204，之后 getStatus 返回 null |
| 关闭后重启 | 返回新的 `sandbox_id` |

### cURL 测试命令

```bash
# 设置基础变量
BASE_URL="http://localhost:8000/api/v1"
SESSION_ID="test-session-$(date +%s)"

# 1. 启动沙箱
curl -X POST "$BASE_URL/session/$SESSION_ID/sandbox/start" \
  -H "Content-Type: application/json" \
  -d '{"sandbox_type": "code_interpreter"}'

# 2. 执行代码
curl -X POST "$BASE_URL/session/$SESSION_ID/sandbox/execute" \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello, World!\")"}'

# 3. 安装依赖
curl -X POST "$BASE_URL/session/$SESSION_ID/sandbox/install" \
  -H "Content-Type: application/json" \
  -d '{"packages": ["requests"]}'

# 4. 获取状态
curl "$BASE_URL/session/$SESSION_ID/sandbox/status"

# 5. 列出文件
curl "$BASE_URL/session/$SESSION_ID/sandbox/files?path=/home/user"

# 6. 关闭沙箱
curl -X POST "$BASE_URL/session/$SESSION_ID/sandbox/stop"
```

### Python 测试脚本

```python
import asyncio
from app.sandbox import E2BSandboxManager, SandboxType

async def test_sandbox():
    manager = E2BSandboxManager.get_instance()
    session_id = "test_session"

    try:
        # 启动
        info = await manager.start(session_id, SandboxType.CODE_INTERPRETER)
        assert info.status.value == "running"
        print(f"✅ 启动成功: {info.sandbox_id}")

        # 执行代码
        result = await manager.execute(session_id, 'print("Hello")')
        assert result.success
        assert "Hello" in result.output
        print(f"✅ 执行成功: {result.output.strip()}")

        # 状态保持
        await manager.execute(session_id, 'x = 42')
        result = await manager.execute(session_id, 'print(x)')
        assert "42" in result.output
        print(f"✅ 状态保持: {result.output.strip()}")

        # 关闭
        await manager.stop(session_id)
        status = await manager.get_status(session_id)
        assert status is None
        print("✅ 关闭成功")

        print("\n🎉 所有测试通过!")

    except Exception as e:
        print(f"❌ 测试失败: {e}")
        raise
    finally:
        await manager.stop(session_id)

if __name__ == "__main__":
    asyncio.run(test_sandbox())
```

---

## 常见问题

### Q: 沙箱会自动关闭吗？

A: 是的。有两种自动关闭机制：
- **空闲超时**: 30 分钟无活动自动关闭
- **最大存活**: 无论是否活跃，1 小时后强制关闭

### Q: 如何在代码执行之间共享数据？

A: 同一 `session_id` 的沙箱会保持状态。在一次执行中定义的变量，可以在后续执行中直接使用。

```python
# 第一次执行
data = [1, 2, 3]

# 第二次执行（同一 session）
print(sum(data))  # 输出: 6
```

### Q: 支持哪些 Python 包？

A: 基础环境预装了常用包（numpy, pandas 等）。其他包可以通过 `/install` 端点安装。

### Q: 文件保存在哪里？

A: 文件保存在沙箱的 `/home/user` 目录下。沙箱关闭后文件会丢失。

### Q: 如何处理大文件？

A: 建议：
- 上传前压缩文件
- 分块处理大文件
- 使用流式下载

### Q: 执行超时怎么办？

A: 单次执行最大 5 分钟。对于长时间任务：
- 分解为多个小任务
- 使用异步处理
- 保存中间结果
