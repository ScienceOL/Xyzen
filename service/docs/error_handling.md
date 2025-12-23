# Error Handling Guide

本文档介绍 Xyzen LLM Chat 应用的错误处理最佳实践。

## 核心设计

### 1. 错误码（ErrCode）

使用 `IntEnum` 定义标准化错误码，分段管理：

```python
from app.common.code.error_code import ErrCode

# 通用错误 (0-999)
ErrCode.SUCCESS            # 0
ErrCode.UNKNOWN_ERROR      # 1
ErrCode.NO_PERMISSION      # 2

# 请求验证 (1xxx)
ErrCode.INVALID_REQUEST    # 1000
ErrCode.EMPTY_MESSAGE      # 1001
ErrCode.MALFORMED_PAYLOAD  # 1002

# Session & Topic (2xxx)
ErrCode.SESSION_NOT_FOUND  # 2000
ErrCode.TOPIC_NOT_FOUND    # 2001

# Provider & Model (3xxx)
ErrCode.PROVIDER_NOT_CONFIGURED  # 3000
ErrCode.PROVIDER_NOT_AVAILABLE   # 3001

# Tool Execution (4xxx)
ErrCode.TOOL_EXECUTION_FAILED    # 4001

# Streaming (5xxx)
ErrCode.STREAM_INTERRUPTED       # 5000
```

### 2. 异常封装（ErrCodeError）

```python
from app.common.code.error_code import ErrCode, ErrCodeError

# 基础用法：直接抛出
raise ErrCodeError(ErrCode.SESSION_NOT_FOUND)

# 附加消息（第一条作为主消息，其余作为详情）
raise ErrCode.PROVIDER_NOT_AVAILABLE.with_messages(
    "Azure OpenAI service is temporarily unavailable",
    "Please retry in 5 minutes",
    "Contact support if issue persists"
)

# 包装原始异常
try:
    result = await dangerous_operation()
except ValueError as e:
    raise ErrCode.TOOL_EXECUTION_FAILED.with_errors(e)
```

### 3. 响应封装（ResponseEnvelope）

```python
from app.schemas.response import ResponseEnvelope

# ✅ 成功响应
return ResponseEnvelope.success({"result": "AI response here"})

# ✅ 显式错误
return ResponseEnvelope.error(
    ErrCode.EMPTY_MESSAGE,
    "Message cannot be empty"
)

# ✅ 从异常构造
try:
    result = await process()
except ErrCodeError as e:
    return ResponseEnvelope.from_exception(e)
```

## 实战场景

### FastAPI 路由

```python
from fastapi import APIRouter
from app.common.code.error_code import ErrCode, ErrCodeError
from app.schemas.response import ResponseEnvelope

router = APIRouter()

@router.post("/chat")
async def chat_endpoint(message: str):
    # 参数验证
    if not message.strip():
        return ResponseEnvelope.error(
            ErrCode.EMPTY_MESSAGE,
            "Message cannot be empty"
        )

    try:
        # 业务逻辑
        result = await process_chat(message)
        return ResponseEnvelope.success(result)

    except ErrCodeError as e:
        # 自动处理业务异常
        return ResponseEnvelope.from_exception(e)

    except Exception as e:
        # 未预期的系统错误
        logger.exception("Unexpected error in chat endpoint")
        return ResponseEnvelope.error(
            ErrCode.UNKNOWN_ERROR,
            "Internal server error",
            [str(e)]
        )
```

### 全局异常处理器

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.common.code.error_code import ErrCodeError
from app.schemas.response import ResponseEnvelope

app = FastAPI()

@app.exception_handler(ErrCodeError)
async def err_code_exception_handler(request: Request, exc: ErrCodeError):
    """统一捕获 ErrCodeError，返回标准格式"""
    response = ResponseEnvelope.from_exception(exc)
    return JSONResponse(
        status_code=200,  # 业务错误统一返回 200
        content=response.model_dump()
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """兜底处理"""
    logger.exception("Unhandled exception")
    response = ResponseEnvelope.error(
        ErrCode.UNKNOWN_ERROR,
        "An unexpected error occurred"
    )
    return JSONResponse(status_code=200, content=response.model_dump())
```

### WebSocket 错误处理

```python
from fastapi import WebSocket
from app.schemas.response import ResponseEnvelope, WSData, WSMetadata
import uuid

async def handle_websocket_message(websocket: WebSocket, message: dict):
    try:
        result = await process_message(message)

        # 成功响应
        ws_response = ResponseEnvelope.success(
            WSData(
                meta=WSMetadata(action="chat_response", message_id=str(uuid.uuid4())),
                data=result
            )
        )
        await websocket.send_json(ws_response.model_dump())

    except ErrCodeError as e:
        # 错误响应
        ws_response = ResponseEnvelope.from_exception(e)
        # 补充 WebSocket 元数据
        ws_response.data = WSData(
            meta=WSMetadata(action="error", message_id=str(uuid.uuid4())),
            data=None
        )
        await websocket.send_json(ws_response.model_dump())
```

### 业务层抛出异常

```python
from app.common.code.error_code import ErrCode, ErrCodeError

async def get_topic(topic_id: str) -> Topic:
    """获取 topic，不存在时抛出标准异常"""
    topic = await repo.get_topic(topic_id)
    if not topic:
        raise ErrCode.TOPIC_NOT_FOUND.with_messages(
            f"Topic {topic_id} does not exist"
        )
    return topic

async def execute_tool(tool_name: str, args: dict) -> Any:
    """执行工具，失败时包装原始异常"""
    try:
        return await mcp_client.call_tool(tool_name, args)
    except TimeoutError as e:
        raise ErrCode.TOOL_EXECUTION_FAILED.with_errors(e)
    except Exception as e:
        raise ErrCode.TOOL_EXECUTION_FAILED.with_messages(
            f"Tool {tool_name} execution failed",
            str(e)
        )
```

## 响应格式

### 成功响应

```json
{
  "code": 0,
  "error": null,
  "data": {
    "result": "AI response here"
  },
  "timestamp": 1729785600
}
```

### 错误响应（无详情）

```json
{
  "code": 3001,
  "error": {
    "msg": "Provider Not Available",
    "info": []
  },
  "data": null,
  "timestamp": 1729785600
}
```

### 错误响应（带详情）

```json
{
  "code": 4001,
  "error": {
    "msg": "Tool execution timeout",
    "info": ["Retry after 30 seconds", "Contact admin if issue persists"]
  },
  "data": null,
  "timestamp": 1729785600
}
```

## 最佳实践

### ✅ 推荐

1. **使用类方法**：`ResponseEnvelope.success()` / `.error()` / `.from_exception()`
2. **分段错误码**：按模块划分区间（1xxx, 2xxx...），便于维护
3. **主消息 + 详情**：第一条消息作为主错误提示，其余作为 `info` 数组
4. **统一 HTTP 200**：业务错误通过 `code` 区分，避免触发框架/浏览器的通用错误处理
5. **全局捕获**：使用 FastAPI 的 `exception_handler` 统一处理 `ErrCodeError`

### ❌ 避免

1. ~~直接返回字典~~：缺乏类型检查
2. ~~混用 HTTP 状态码表示业务错误~~：400/404/500 应保留给传输层
3. ~~硬编码错误消息~~：使用 `ErrCode` 枚举统一管理
4. ~~吞掉原始异常~~：用 `.with_errors()` 保留堆栈信息

## Python 生态对比

| 方案                       | 描述                        | 适用场景                    |
| -------------------------- | --------------------------- | --------------------------- |
| **当前设计**               | IntEnum + Pydantic + 类方法 | ✅ 类型安全 + 优雅 + 序列化 |
| `fastapi-responses`        | 第三方包装库                | 功能重叠，不如自己控制      |
| `http.HTTPStatus`          | 标准库 HTTP 状态            | ❌ 仅传输层，不适合业务错误 |
| `werkzeug.exceptions`      | Flask 异常体系              | ❌ 与 FastAPI 不兼容        |
| `pydantic.ValidationError` | Pydantic 验证错误           | ✅ 请求参数验证，配合使用   |

**结论**：当前设计已是 FastAPI + Pydantic 生态的最佳实践，无需引入第三方包。

## 扩展场景

### 分页响应

```python
from pydantic import BaseModel
from typing import List

class PageData(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[Any]

@router.get("/messages")
async def list_messages(page: int = 1, page_size: int = 10):
    items, total = await get_messages(page, page_size)
    return ResponseEnvelope.success(
        PageData(total=total, page=page, page_size=page_size, items=items)
    )
```

### 批量操作

```python
class BatchResult(BaseModel):
    success_count: int
    failed_count: int
    failures: List[dict]

@router.post("/batch-delete")
async def batch_delete(ids: List[str]):
    results = {"success": 0, "failed": 0, "failures": []}

    for id in ids:
        try:
            await delete_item(id)
            results["success"] += 1
        except ErrCodeError as e:
            results["failed"] += 1
            results["failures"].append({
                "id": id,
                "error": ResponseEnvelope.from_exception(e).model_dump()
            })

    return ResponseEnvelope.success(BatchResult(**results))
```

## 注意事项

1. **错误码唯一性**：新增错误码时确保数值不冲突
2. **前端约定**：前端根据 `code === 0` 判断成功，非 0 展示 `error.msg`
3. **日志记录**：异常应在业务层记录详细日志，响应只返回用户友好信息
4. **国际化**：`error.msg` 可后续接入 i18n，根据请求语言返回翻译
5. **监控告警**：对 `UNKNOWN_ERROR` (code=1) 设置告警，及时发现未处理异常
6. **响应方法同步**：`ResponseEnvelope` 的类方法是同步的（纯数据处理无 I/O），可直接在异步函数中调用

## 总结

**当前设计的核心优势**：

1. ✅ **类方法模式**：`ResponseEnvelope.success(data)` 比函数调用更 Pythonic
2. ✅ **类型安全**：泛型 + Pydantic 确保编译时检查
3. ✅ **无需第三方包**：纯标准库 + FastAPI 生态
4. ✅ **前后端一致**：JSON 结构与 Go 版本完全兼容
5. ✅ **可扩展**：易于添加新错误码和响应字段

这是目前 Python/FastAPI 领域的**工业级最佳实践**。
