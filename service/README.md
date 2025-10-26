## Xyzen Service

面向 Xyzen 的后端服务（FastAPI）。集成了 LangChain/LangGraph、MCP（Model Context Protocol）、WebSocket 流式聊天、可插拔的 LLM 提供商、以及基于 SQLModel + Alembic 的数据库持久化。

关键特性：

- FastAPI + WebSocket：REST API 与流式聊天接口
- 多模型提供商：Azure OpenAI、OpenAI、Anthropic、Google 等（通过 Providers 管理）
- LangChain/LangGraph Agent：自动工具调用、MCP 工具接入
- 数据持久化：PostgreSQL/SQLite（SQLModel + Alembic），会话/主题/消息等实体
- 会话记忆：对话历史存储与重放（基于现有 `Message` 表）
- Docker 一键启动：开发/生产编排模板

## 目录结构（部分）

- `app/main.py`：应用入口（FastAPI、路由注册、生命周期、DB 初始化）
- `handler/api`：REST API（`/xyzen/api/v1/...`）
- `handler/ws`：WebSocket（`/xyzen/ws/v1/...`）
- `core/chat`：聊天核心（LangChain/LangGraph、工具、流式处理）
- `core/providers`：LLM 提供商抽象与选择
- `models/`：SQLModel 数据模型（Session/Topic/Message/Provider/...）
- `repo/`：Repository 层（数据库读写封装）
- `middleware/database`：数据库连接、Alembic 迁移启动
- `internal/configs`：配置系统（`XYZEN_` 前缀环境变量）
- `docs/`：专项文档（如错误处理）
- `pyproject.toml`：依赖与类型检查配置

## 快速开始

你可以选择 Docker 或本地运行（uv）。

### 方式 A：Docker（推荐）

1. 在仓库根目录使用 Dev 编排：

- `docker/docker-compose.base.yaml`
- `docker/docker-compose.dev.yaml`

会启动：network-service、PostgreSQL、Redis、service、web 等。Service 将通过 `/xyzen/api/health` 做健康检查。

端口（可通过环境变量覆盖）：

- Service: 48196（HTTP）
- Web: 32233

2. 环境变量：

- Dev 模式下 compose 使用 `docker/.env.dev`（自行按需补充）。
- 服务内部通过 `XYZEN_` 前缀读取，例如：
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
  - `XYZEN_LLM_DEPLOYMENT=gpt-4o`（示例）

3. 启动：

- 使用两份 compose 叠加启动 Dev 服务（在仓库根目录执行）。

### 方式 B：本地（uv）

1. 进入 `service/` 目录并安装依赖（`uv sync`）。

2. 准备 `.env`（见上方环境变量示例）。

3. 运行：`uv run python -m app.main`。

应用启动后：

- Swagger: `http://localhost:48196/xyzen/api/docs`
- OpenAPI: `http://localhost:48196/xyzen/api/openapi.json`
- 健康检查: `http://localhost:48196/xyzen/api/health`

## API 与 WebSocket

- REST 根：`/xyzen/api/v1`

  - `GET /auth/*`
  - `GET /providers/*`
  - `GET /sessions/*`
  - `GET /topics/*`
  - `GET /agents/*`
  - `GET /mcps/*`
  - 健康检查：`/xyzen/api/health`

- WebSocket 根：`/xyzen/ws/v1`
  - 聊天：`/chat/sessions/{session_id}/topics/{topic_id}`
  - MCP 更新：`/mcp/*`

## 数据库与迁移

- 需要使用 `docker exec` 连接到数据库容器操作
- SQLModel + Alembic。
- 应用启动时自动执行 Alembic 迁移（见 `middleware/database/connection.py::create_db_and_tables`）。
- 支持 PostgreSQL 与 SQLite（通过 `XYZEN_DATABASE_ENGINE` 切换）。
- 生成/升级迁移（可选）：
  - 生成：`uv run alembic revision -m "your message" --autogenerate`
  - 升级：`uv run alembic upgrade head`

## 会话记忆（Conversation Memory）

- 复用 `models/message.py`：
  - 保存 `user` 与 `assistant` 的对话轮次。
  - 每次对话前加载该 Topic 的历史消息，并作为上下文传给 Agent。
- 主要逻辑：`core/chat/langchain.py`
  - `_load_db_history`：加载历史并映射为 LangChain 消息
  - `get_ai_response_stream_langchain`：流式响应、消息持久化、Topic 时间戳刷新
- 工具调用（MCP）事件可选持久化为 `role="tool"`（在 WS 流程中已示例）。

若需要 LangGraph 文档中的“长期记忆（Store + 语义检索）”，可选两条路径：

1. 继续复用现有数据库：新增 `Memory` 表 + 语义索引（embedding），实现一个轻量 Store 适配层
2. 直接接入 LangGraph PostgresStore：`from langgraph.store.postgres import PostgresStore` 并在编译图时传入 `store=...`

## LLM 提供商与 MCP

- LLM：默认从 `internal/configs/llm.py` 读取（也支持数据库中的 Providers）。
- MCP：通过 `handler/mcp` 注册，应用启动时创建并注入子应用，工具列表会按 Agent 的 MCP 配置动态刷新。

## 日志

- 配置：`middleware/logger/`（受 `XYZEN_LOGGER_LEVEL` 等影响）。
- Uvicorn/SQLAlchemy 等日志级别已做合理默认值。

## 开发与质量

- 代码风格：Black + isort
- 类型检查：Pyright（VS Code 使用 Pylance，设置见根目录 `.vscode/settings.json`）
- 预提交钩子：可选 `pre-commit`（本项目主要使用 `uv` + IDE 配置）

## 故障排查

- 服务无法连接数据库：检查 `XYZEN_DATABASE_*` 和容器网络（Docker 下 `network-service` 共享网络模式）。
- Swagger 无法访问：确认应用端口（`XYZEN_PORT`）和反向代理/容器映射。
- 模型不可用：确认 LLM Key/Endpoint/Deployment 是否正确；或在 DB 中配置 Provider 并在会话/Agent 选择。
- 工具不可用：确认 MCP 服务健康、工具清单已刷新、鉴权是否配置。

## 许可证

- 见仓库根目录 `LICENSE`。
