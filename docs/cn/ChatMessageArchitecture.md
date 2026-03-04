# Chat 消息通信架构

## 1. 概述

Xyzen 的 Chat 系统采用**无状态异步架构**，解耦连接管理与计算任务：

```
用户 → WebSocket (FastAPI) → Celery Task (Worker) → LLM Provider
                ↑                      ↓
                └── Redis Pub/Sub ←────┘
```

- **WebSocket Handler**：管理客户端连接、生成 `stream_id`、派发 Celery 任务
- **Celery Worker**：执行 LLM 调用、处理事件流、持久化消息
- **Redis**：承担两个角色 — Celery 任务队列 + 事件 Pub/Sub 桥接
- **`stream_id`**：贯穿整个消息生命周期的唯一标识符，由 WebSocket handler 在 Celery 任务派发前生成

这种架构使 API 容器保持无状态，Web 层和 Worker 层可以独立扩缩容。

---

## 2. 事件生命周期

从用户发送消息到收到完整回复的全流程：

### 2.1 消息发送阶段

```
1. 用户在前端输入消息，WebSocket 发送到服务端
2. WebSocket Handler (api/ws/v1/chat.py):
   ├─ 验证 session/topic 归属权
   ├─ 生成 stream_id: "stream_{timestamp}_{uuid_hex[:8]}"
   ├─ 直接发送 loading 事件到 WebSocket（无需经过 Redis）
   └─ 派发 Celery 任务，携带 stream_id
```

### 2.2 后端处理阶段

```
3. Celery Worker (tasks/chat.py):
   ├─ 创建 RedisPublisher(connection_id)
   ├─ 清除可能残留的 abort 信号
   ├─ 调用 get_ai_response_stream(..., stream_id=stream_id)
   └─ 进入事件处理循环

4. LangChain 流式处理 (core/chat/langchain.py):
   ├─ 创建 StreamContext(stream_id=stream_id)
   ├─ 将 stream_id 传播到 AgentEventContext
   ├─ 通过 async generator yield 事件:
   │   ├─ agent_start → node_start
   │   ├─ streaming_start → streaming_chunk... → streaming_end
   │   ├─ thinking_start → thinking_chunk... → thinking_end
   │   ├─ tool_call_request → tool_call_response
   │   └─ node_end → agent_end
   └─ 最终 finalize: streaming_end + token_usage
```

### 2.3 事件回传阶段

```
5. Celery Worker 将每个事件发布到 Redis channel "chat:{connection_id}"
6. WebSocket Handler 的后台 listener 监听该 channel，转发到客户端
7. 前端 chatSlice 接收事件:
   ├─ 通过 stream_id / findMessageByStreamId 找到对应 Message
   ├─ 更新 Message 状态（status, content, thinkingContent 等）
   └─ chunk 事件使用 rAF 缓冲（~60fps 刷新）减少 Zustand set() 调用
```

### 2.4 持久化阶段

```
8. Worker 在流式过程中每 3 秒增量保存消息内容
9. 流式结束后提交最终 DB 记录
10. 发送 message_saved 事件:
    { stream_id, db_id, created_at }
    前端据此将临时消息 ID 替换为数据库 UUID
```

### 2.5 中断流程

```
用户点击停止 → WebSocket handler 设置 Redis key "abort:{connection_id}" (TTL 60s)
             → Worker 每 0.5 秒轮询该 key
             → 检测到后中断流式，发送 stream_aborted 事件
             → 更新 AgentRun 状态为 "cancelled"
```

---

## 3. 事件类型完整清单

### 3.1 服务端 → 客户端 (ChatEventType)

#### 通用事件

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `loading` | `{ message, stream_id? }` | 加载指示器，WebSocket handler 直接发送 |
| `processing` | `{ status, stream_id? }` | 处理状态更新（preparing_request 等） |
| `error` | `{ error, error_code?, error_category?, recoverable?, detail?, stream_id? }` | 结构化错误信息 |
| `message` | `{ id, content }` | 非流式完整消息响应 |

#### 流式生命周期

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `streaming_start` | `{ stream_id, execution_id? }` | 开始流式输出 |
| `streaming_chunk` | `{ stream_id, content, execution_id? }` | Token 增量块 |
| `streaming_end` | `{ stream_id, created_at, execution_id?, content?, agent_state? }` | 结束流式输出 |

#### 推理内容（Thinking）

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `thinking_start` | `{ stream_id }` | 开始推理过程（Claude、DeepSeek R1、Gemini） |
| `thinking_chunk` | `{ stream_id, content }` | 推理内容增量块 |
| `thinking_end` | `{ stream_id }` | 结束推理过程 |

#### 工具调用

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `tool_call_request` | `{ id, name, description, arguments, status, timestamp }` | 工具执行请求 |
| `tool_call_response` | `{ toolCallId, status, result, raw_result?, error? }` | 工具执行结果 |

#### Agent 执行事件

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `agent_start` | `{ context, total_nodes?, estimated_duration_ms? }` | Agent 开始执行 |
| `agent_end` | `{ context, status, duration_ms, output_summary? }` | Agent 执行结束 |
| `agent_error` | `{ context, error_type, error_message, recoverable, node_id? }` | Agent 错误 |
| `node_start` | `{ node_id, node_name, node_type, component_key?, input_summary?, context }` | 节点开始 |
| `node_end` | `{ node_id, node_name, node_type, component_key?, status, duration_ms, output_summary?, context }` | 节点结束 |
| `subagent_start` | `{ subagent_id, subagent_name, subagent_type, input_summary?, context }` | 子 Agent 开始（预留） |
| `subagent_end` | `{ subagent_id, subagent_name, status, duration_ms, output_summary?, context }` | 子 Agent 结束（预留） |
| `progress_update` | `{ progress_percent, message, details?, context }` | 进度更新 |

其中 `context` 为 `AgentExecutionContext`：

```python
{
    "agent_id": str,
    "agent_name": str,
    "agent_type": str,          # "react" | "graph" | "system"
    "execution_id": str,
    "parent_execution_id"?: str,
    "depth": int,               # 0=根 Agent, 1+=子 Agent
    "execution_path": list[str],
    "current_node"?: str,
    "current_phase"?: str,
    "started_at": float,
    "elapsed_ms"?: int,
    "stream_id"?: str,          # 来自 WebSocket handler
}
```

#### 后处理事件

| 事件类型 | Payload 结构 | 说明 |
|---------|-------------|------|
| `message_saved` | `{ stream_id, db_id, created_at }` | 消息持久化确认，stream_id → db_id 映射 |
| `message_ack` | — | 消息接收确认 |
| `token_usage` | `{ input_tokens, output_tokens, total_tokens }` | Token 消耗统计 |
| `search_citations` | `{ citations: [{url, title, cited_text, ...}] }` | 搜索引用 |
| `generated_files` | `{ files: [{id, name, type, size, category, download_url}] }` | 生成文件 |
| `insufficient_balance` | `{ error_code, message, message_cn?, details?, action_required, stream_id? }` | 余额不足 |
| `stream_aborted` | `{ reason, partial_content_length?, tokens_consumed?, stream_id? }` | 流中断通知 |

### 3.2 客户端 → 服务端 (ChatClientEventType)

| 事件类型 | 说明 |
|---------|------|
| `message` | 用户消息（默认类型） |
| `tool_call_confirm` | 确认执行工具 |
| `tool_call_cancel` | 取消工具调用 |
| `regenerate` | 消息编辑后重新生成 |
| `abort` | 中断流式生成 |

---

## 4. Message 模型字段说明

前端 `Message` interface（`web/src/store/types.ts`）：

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `id` | `string` | 前端生成 `loading-{timestamp}` 或 DB UUID | 消息唯一标识，初始为临时 ID |
| `streamId` | `string?` | `streaming_start` 事件的 `stream_id` | 贯穿整个消息生命周期的路由标识 |
| `dbId` | `string?` | `message_saved` 事件的 `db_id` | 数据库持久化后的 UUID |
| `clientId` | `string?` | 前端 `generateClientId()` | 客户端消息的去重标识 |
| `content` | `string` | `streaming_chunk` 逐步累积 | 消息正文内容 |
| `role` | `"user" \| "assistant" \| "system" \| "tool"` | 消息创建时设置 | 消息角色 |
| `created_at` | `string` | `streaming_end` 或消息创建时间 | ISO 时间戳 |
| `status` | `MessageStatus` | 事件驱动的状态机（见第 5 节） | 统一生命周期状态 |
| `isLoading` | `boolean?` | 兼容字段，等同 `status === "pending"` | **@deprecated** |
| `isStreaming` | `boolean?` | 兼容字段，等同 `status === "streaming"` | **@deprecated** |
| `isThinking` | `boolean?` | 兼容字段，等同 `status === "thinking"` | **@deprecated** |
| `isNewMessage` | `boolean?` | 前端设置 | 区分新消息和加载的历史消息（用于打字效果） |
| `thinkingContent` | `string?` | `thinking_chunk` 逐步累积 | 推理过程内容 |
| `toolCalls` | `ToolCall[]?` | `tool_call_request/response` 事件 | 工具调用列表 |
| `attachments` | `MessageAttachment[]?` | 用户上传或 `generated_files` 事件 | 多媒体附件 |
| `citations` | `SearchCitation[]?` | `search_citations` 事件 | 搜索引用列表 |
| `agentExecution` | `AgentExecutionState?` | `agent_start/node_start` 等事件构建 | Agent 执行状态 |
| `agent_metadata` | `AgentMetadata?` | 数据库加载时重建 | 可持久化的 Agent 元数据 |
| `error` | `MessageError?` | `error` 事件的结构化错误 | 错误信息（code, category, message, recoverable） |

---

## 5. MessageStatus 状态机

```
                    ┌─────────────┐
                    │   pending   │  ← 初始状态，等待后端响应
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌────────────┐ ┌──────────┐ ┌────────┐
       │  thinking   │ │ streaming│ │ failed │
       │（推理中）    │ │（流式中） │ │（错误） │
       └──────┬─────┘ └────┬─────┘ └────────┘
              │            │
              ▼            │
       ┌──────────┐        │
       │ streaming │◄──────┘
       └────┬─────┘
            │
       ┌────┼────────┐
       ▼              ▼
┌───────────┐  ┌───────────┐
│ completed │  │ cancelled │
│（正常完成）│  │（用户中断）│
└───────────┘  └───────────┘
```

状态转换规则：

| 当前状态 | 触发条件 | 目标状态 |
|---------|---------|---------|
| — | 创建加载消息 | `pending` |
| `pending` | 收到 `thinking_start` | `thinking` |
| `pending` | 收到 `streaming_start` | `streaming` |
| `pending` | 收到 `error` | `failed` |
| `thinking` | 收到 `thinking_end` + 开始流式 | `streaming` |
| `streaming` | 收到 `streaming_end` | `completed` |
| `streaming` | 用户中断 (`stream_aborted`) | `cancelled` |
| `streaming` | 收到 `error` | `failed` |

---

## 6. 事件到状态的映射表

前端 `chatSlice.ts` 中各事件对 Message 字段的影响：

| 后端事件 | Message.status | 影响的字段 | 说明 |
|---------|---------------|-----------|------|
| `loading` | `pending` | 创建新 Message：id=`loading-{ts}`, role="assistant", isLoading=true | WebSocket handler 直接发送 |
| `processing` | 不变 | 无直接影响 | 仅日志用途 |
| `streaming_start` | → `streaming` | streamId, isStreaming=true, isLoading=false; 创建 fallback phase | stream_id 关联 |
| `streaming_chunk` | 不变 | content += chunk; phase.streamedContent += chunk | rAF 缓冲批量刷新 |
| `streaming_end` | → `completed` | isStreaming=false, created_at | 最终化消息 |
| `thinking_start` | → `thinking` | isThinking=true | 推理开始 |
| `thinking_chunk` | 不变 | thinkingContent += chunk | rAF 缓冲批量刷新 |
| `thinking_end` | 不变 | isThinking=false | 推理结束 |
| `tool_call_request` | 不变 | toolCalls.push({id, name, arguments, status}) | 添加工具调用 |
| `tool_call_response` | 不变 | toolCall.status, toolCall.result/error | 更新工具状态 |
| `agent_start` | 不变 | agentExecution = {agentType, status:"running", phases:[]} | 初始化 Agent 执行 |
| `node_start` | 不变 | phases.push({id, status:"running"}) | 添加执行阶段 |
| `node_end` | 不变 | phase.status = "completed" | 标记阶段完成 |
| `agent_end` | 不变 | agentExecution.status = "completed"/"failed" | 标记 Agent 完成 |
| `message_saved` | 不变 | dbId = db_id; 可能更新 id | 持久化确认，stream_id → db_id |
| `search_citations` | 不变 | citations = [...] | 添加搜索引用 |
| `generated_files` | 不变 | attachments.push(...files) | 添加生成文件 |
| `error` | → `failed` | error = {code, category, message, recoverable} | 结构化错误 |
| `insufficient_balance` | → `failed` | 创建错误消息 | 余额不足 |
| `stream_aborted` | → `cancelled` | isStreaming=false | 中断通知 |
| `token_usage` | 不变 | 无前端字段影响 | 仅统计用途 |

---

## 7. 关键文件索引

### 后端

| 文件 | 职责 |
|------|------|
| `service/app/schemas/chat_event_types.py` | ChatEventType / ChatClientEventType 枚举定义 |
| `service/app/schemas/chat_event_payloads.py` | 所有事件的 TypedDict payload 结构 |
| `service/app/schemas/agent_event_payloads.py` | Agent 执行事件的 payload 和 AgentExecutionContext |
| `service/app/api/ws/v1/chat.py` | WebSocket 连接管理、stream_id 生成、Celery 任务派发 |
| `service/app/tasks/chat.py` | Celery 任务：事件循环、Redis 发布、消息持久化、AgentRun 追踪 |
| `service/app/core/chat/langchain.py` | LLM 流式调用、StreamContext 管理、事件 yield |
| `service/app/core/chat/stream_handlers.py` | StreamContext 数据类、事件工厂函数 |
| `service/app/core/chat/agent_event_handler.py` | AgentEventContext 管理、Agent 事件创建 |

### 前端

| 文件 | 职责 |
|------|------|
| `web/src/store/types.ts` | Message / MessageStatus / ChatChannel 类型定义 |
| `web/src/store/slices/chatSlice.ts` | 事件处理、状态更新、chunk 缓冲、连接管理 |
| `web/src/core/chat/types.ts` | WebSocketMessageEvent 联合类型 |
| `web/src/core/chat/messageProcessor.ts` | 消息创建/转换工具函数 |
| `web/src/core/chat/messageContent.ts` | 消息内容解析（phase content、display mode） |
| `web/src/core/chat/channelStatus.ts` | Topic 状态派生（running/stopping/idle） |
| `web/src/core/chat/websocketManager.ts` | WebSocket 连接封装 |
| `web/src/service/xyzenService.ts` | WebSocket 客户端实现 |
| `web/src/components/layouts/components/ChatBubble.tsx` | 消息气泡渲染 |
| `web/src/components/layouts/components/AgentExecutionTimeline.tsx` | 多阶段 Agent 执行 UI |
| `web/src/types/agentEvents.ts` | Agent 事件前端类型定义 |

### stream_id vs. 其他 ID

| ID | 生成位置 | 用途 |
|----|---------|------|
| `stream_id` | WebSocket handler（`stream_{ts}_{hex}`） | 消息生命周期路由，前端 findMessageByStreamId |
| `execution_id` | AgentEventContext（自动生成） | Agent 执行追踪，AgentRun 记录 |
| `db_id` | 数据库（UUID） | 持久化消息 ID，message_saved 事件回传 |
| `loading-{ts}` | 前端 | 临时消息 ID，在 message_saved 后替换 |
| `clientId` | 前端 `generateClientId()` | 用户消息去重 |
