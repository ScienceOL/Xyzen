# 长期记忆（Long-term Memory）与测试说明

本文档介绍后端 Service 中“长期记忆”的能力：如何启用、它是如何工作的，以及如何通过 WebSocket 手工验证“记住/remember …”在后续对话被召回。

## 功能概述

系统同时具备两类记忆：

- 短期对话记忆（Conversation History）
  - 复用现有 `models/message.py`，将 `user`/`assistant` 轮次写入数据库。
  - 每次新对话前，从 `Message` 表按时间顺序加载该 Topic 历史消息，并作为上下文传给模型。
- 长期记忆（Long-term Memory, 语义可检索）
  - 当数据库引擎为 Postgres 时，启用 LangGraph 的 Postgres Store。
  - 用户在消息里显式说“记住 … / remember …”时，会把该文本写入 Store 的命名空间 `( "memories", user_id )`。
  - 每次对话前，以用户本轮输入作为 query 做语义检索，取最多 5 条相关记忆附加进系统提示（System Prompt）中，帮助模型回答。

触发规则（匹配任意一个即可）：

- 中文：`记住[:：]?\s*(.+)$`
- 英文：`remember(?:\s+that)?[:\s]+(.+)$`（大小写不敏感）

实现位置：

- 入口：`core/chat/langgraph.py::get_ai_response_stream`
- 历史加载：`_load_db_history`
- Store 读写：使用 `langgraph.store.postgres.aio.AsyncPostgresStore`

注意：消息的最终持久化（`user` / `assistant` / `tool`）仍由 WebSocket Handler 负责（`handler/ws/v1/chat.py`）。`langchain.py` 仅做“读取历史”和“长期记忆读写”。

## 启用条件与配置

必须使用 PostgreSQL：

- 环境变量（示例）：
  - `XYZEN_DATABASE_ENGINE=postgres`
  - `XYZEN_DATABASE_POSTGRES_HOST=localhost`
  - `XYZEN_DATABASE_POSTGRES_PORT=5432`
  - `XYZEN_DATABASE_POSTGRES_USER=postgres`
  - `XYZEN_DATABASE_POSTGRES_PASSWORD=postgres`
  - `XYZEN_DATABASE_POSTGRES_DBNAME=postgres`

依赖（已在 `pyproject.toml` 中，或可通过 uv 安装）：

- `langgraph`
- `langgraph-checkpoint-postgres`

若切换为 SQLite（`XYZEN_DATABASE_ENGINE=sqlite`），长期记忆会自动跳过，服务仍可工作但不做“记住/召回”。

## 接口与路径

- WebSocket 根路径：`/xyzen/ws/v1`
- 聊天路径：`/xyzen/ws/v1/chat/sessions/{session_id}/topics/{topic_id}`
- 认证：通过查询参数携带 `token`（JWT 等），由 `middleware.auth.get_auth_context_websocket` 校验。

示例完整地址：

```
ws://localhost:48196/xyzen/ws/v1/chat/sessions/<SESSION_ID>/topics/<TOPIC_ID>?token=<TOKEN>
```

发送消息的 JSON 结构（最简）：

```json
{ "message": "你的问题或指令" }
```

服务端流式事件（部分）：

- `streaming_start` / `streaming_chunk` / `streaming_end`
- `tool_call_request` / `tool_call_response`
- `message_saved`

详情见 `service/schemas/chat_events.py`。

## 手工测试步骤（推荐）

以下以本地开发为例，确保服务已启动，且可以获得有效 `token`、`session_id`、`topic_id`。

### 方式 A：使用 wscat

1. 连接 WebSocket（替换变量）：

```bash
wscat -c "ws://localhost:48196/xyzen/ws/v1/chat/sessions/<SESSION_ID>/topics/<TOPIC_ID>?token=<TOKEN>"
```

2. 发送“记住”指令（中文或英文二选一）：

```json
{ "message": "记住我的名字是 Bob" }
```

或：

```json
{ "message": "remember my favorite color is blue" }
```

观察控制台：会看到流式事件，以及后台会将这段内容写入长期记忆存储。

3. 在同一连接中，发送带有“查询记忆意图”的问题：

```json
{ "message": "我叫什么名字？" }
```

或：

```json
{ "message": "what's my favorite color?" }
```

期望：模型能够基于上一步“记住”的内容进行回答。内部会在本轮调用前做语义检索，并把命中的记忆附加到 System Prompt 的 `[LONG-TERM MEMORIES]` 段落中。

### 方式 B：Python 脚本（可选）

```python
import asyncio
import json
import websockets

WS_URL = "ws://localhost:48196/xyzen/ws/v1/chat/sessions/<SESSION_ID>/topics/<TOPIC_ID>?token=<TOKEN>"

async def main():
    async with websockets.connect(WS_URL) as ws:
        # 1) 写入长期记忆
        await ws.send(json.dumps({"message": "记住我的名字是 Bob"}, ensure_ascii=False))
        for _ in range(5):
            print(await ws.recv())
        # 2) 召回
        await ws.send(json.dumps({"message": "我叫什么名字？"}, ensure_ascii=False))
        for _ in range(20):
            print(await ws.recv())

asyncio.run(main())
```

你会看到 `streaming_*` 事件以及最终的回答。

## 常见问题（FAQ）

- 记忆没有被召回？
  - 确认使用的是 PostgreSQL（`XYZEN_DATABASE_ENGINE=postgres`）。
  - 确认网络与凭据正确，服务日志里若出现 `Store init skipped`，表示 Store 初始化被跳过（请检查配置）。
  - 记忆是按语义检索的，检索 query 来自“本轮用户输入”，若措辞差异很大可能命中率低，可尝试更贴近“记住”的表达。
- 收到两个助手消息/重复输出？
  - 已在实现中避免重复输出：只有 `messages` 流（token 流）负责对外输出文本；`updates` 流仅用于步骤/工具事件。
- WebSocket 连接失败？
  - 确认 URL 路径包含 `/xyzen/ws/v1/chat/...` 前缀，且查询参数含 `token`。
  - 检查服务是否在 `48196` 端口（或你的自定义端口）运行。
- 依赖缺失？
  - 使用 `uv add langgraph langgraph-checkpoint-postgres` 安装（或 `uv sync`）。

## 参考位置（源码）

- `core/chat/langgraph.py`：StateGraph + Checkpointer + Store、长期记忆读取/写入、流式输出
- `handler/ws/v1/chat.py`：WebSocket 入口、消息与事件下发、消息持久化
- `schemas/chat_events.py`：事件类型枚举
- `internal/configs`：数据库与鉴权等配置

---

如需进一步对齐 LangGraph 官方“原生图（StateGraph + Checkpointer + Store）”方案，可将当前 Agent 管道迁移为图节点：

- 节点建议：`retrieve_memories` → `agent` → `store_memories`
- Checkpointer：使用 `langgraph-checkpoint-postgres` 作为对话状态检查点；
- Store：沿用本文中的 Postgres Store。

当前实现已满足“显式记住 + 后续自动召回”的生产需求；如果你希望我把完整 StateGraph 脚手架也一并落地，请告诉我。
