# Xyzen Service

Xyzen 的后端服务（FastAPI）。提供流式聊天、多 Agent 执行、MCP 工具接入以及基于 Provider 的 LLM 配置。

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## 关键特性

- FastAPI + WebSocket 流式聊天
- 多模型提供商路由（OpenAI、Azure OpenAI、Anthropic、Google）
- LangChain/LangGraph Agent 与工具调用
- SQLModel + Alembic 数据持久化（Session/Topic/Message）
- Docker 优先的开发与部署

## 目录概览

- `app/main.py`：FastAPI 应用入口
- `app/api/v1`：REST API
- `app/api/ws/v1`：WebSocket 接口
- `app/core/chat`：流式执行与 Agent 运行时
- `app/core/providers`：Provider 配置与路由
- `app/models`：SQLModel 数据模型
- `app/repos`：Repository 数据访问层
- `app/schemas`：Pydantic/TypedDict 结构
- `app/mcp`：MCP 集成
- `app/tasks`：Celery 任务
- `migrations/`：Alembic 迁移

## 快速开始（Docker）

使用根目录脚本启动：

```bash
./launch/dev.sh     # 前台
./launch/dev.sh -d  # 后台
```

启动后访问：

- Swagger: `http://localhost:48196/xyzen/api/docs`
- OpenAPI: `http://localhost:48196/xyzen/api/openapi.json`
- 健康检查: `http://localhost:48196/xyzen/api/health`

## 环境变量

开发环境读取 `docker/.env.dev`，配置变量使用 `XYZEN_` 前缀。

常见示例：

- `XYZEN_ENV=dev`
- `XYZEN_DEBUG=true`
- `XYZEN_DATABASE_ENGINE=postgres|sqlite`
- `XYZEN_DATABASE_POSTGRES_HOST=localhost`
- `XYZEN_DATABASE_POSTGRES_PORT=5432`
- `XYZEN_DATABASE_POSTGRES_USER=postgres`
- `XYZEN_DATABASE_POSTGRES_PASSWORD=postgres`
- `XYZEN_DATABASE_POSTGRES_DBNAME=postgres`
- `XYZEN_LLM_PROVIDER=azure_openai|openai|anthropic|google`
- `XYZEN_LLM_KEY=...`
- `XYZEN_LLM_ENDPOINT=...`
- `XYZEN_LLM_VERSION=...`
- `XYZEN_LLM_DEPLOYMENT=gpt-4o`

## API 与 WebSocket

- REST 根路径：`/xyzen/api/v1`
  - `GET /auth/*`
  - `GET /providers/*`
  - `GET /sessions/*`
  - `GET /topics/*`
  - `GET /agents/*`
  - `GET /mcps/*`
  - 健康检查：`/xyzen/api/health`
- WebSocket 根路径：`/xyzen/ws/v1`
  - 聊天：`/chat/sessions/{session_id}/topics/{topic_id}`
  - MCP 更新：`/mcp/*`

## 数据库与迁移

- Alembic 在应用启动时自动执行迁移。
- 支持 PostgreSQL 与 SQLite（`XYZEN_DATABASE_ENGINE`）。

可选手动迁移：

```bash
uv run alembic revision -m "your message" --autogenerate
uv run alembic upgrade head
```

## LLM Provider 与 MCP

- Provider 配置位于 `app/core/providers` 与 `internal/configs`。
- MCP 服务在 `app/mcp` 注册，并在 Agent 执行时接入。

## 常见问题

- 数据库连接失败：检查 `XYZEN_DATABASE_*` 与容器网络。
- Swagger 无法访问：确认 `XYZEN_PORT` 与端口映射。
- 模型不可用：检查 Provider Key/Endpoint 与会话配置。
- MCP 工具不可用：确认 MCP 服务健康与鉴权配置。
