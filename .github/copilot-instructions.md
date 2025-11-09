# Xyzen AI Agent Instructions

This document provides guidance for AI coding agents to effectively contribute to the Xyzen codebase.

## Architecture Overview

Xyzen is a full-stack AI laboratory server with a decoupled backend service and a React-based frontend.

- **Backend (`/service`)**: A FastAPI application that handles core logic, including WebSocket-based chat, integration with Large Language Models (LLMs) through various providers, and data persistence using PostgreSQL. It leverages LangChain/LangGraph for building conversational agents.
- **Frontend (`/web`)**: A React application providing the user interface for interacting with the AI chat functionalities. It's designed as a modern, extensible chat component.
- **Containerization (`/docker`)**: The project is fully containerized using Docker, which is the recommended way for setting up a development environment. The Docker setup includes the backend, frontend, a PostgreSQL database, Mosquitto (an MQTT broker), and Casdoor for authentication.

Key directories to be aware of:

- `service/app/main.py`: The main entry point for the FastAPI backend.
- `service/core/chat`: Contains the core chat logic, including LangChain/LangGraph integrations.
- `service/models`: Defines the SQLModel data models for database entities like sessions, topics, and messages.
- `service/repo`: The repository layer that abstracts database interactions.
- `web/src/main.tsx`: The main entry point for the React frontend.

## 前端技术架构与分层设计

## 📋 各层职责一览表

| 层级          | 位置             | 职责      | 可以做                                                      | 不能做                                                 |
| ------------- | ---------------- | --------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Component** | `components/`    | UI 渲染   | • 渲染 JSX • 绑定事件 • 调用 Hook                           | • 直接访问 Store • 包含业务逻辑 • HTTP 请求            |
| **Hook**      | `hooks/`         | 能力封装  | • 封装 Core 方法 • 订阅 Store • 生命周期处理 • 计算派生状态 | • 包含核心业务逻辑 • 直接调用 Service • 复杂的流程编排 |
| **Core** ⭐   | `core/`          | 业务逻辑  | • 所有业务逻辑 • 流程编排 • 调用 Store/Query • 处理副作用   | • 渲染 UI • 操作 DOM • 直接访问组件状态                |
| **Store**     | `store/`         | 状态管理  | • 定义状态 • 更新状态 • 持久化                              | • 业务逻辑 • HTTP 请求 • 复杂计算                      |
| **Query**     | `hooks/queries/` | 数据缓存  | • 封装请求 • 缓存策略 • 调用 Service                        | • 业务流程编排 • 状态管理                              |
| **Service**   | `service/`       | HTTP 请求 | • 纯 HTTP 请求 • 数据序列化                                 | • 业务逻辑 • 状态管理 • UI 交互                        |
| **Utils**     | `utils/`         | 工具函数  | • 格式化 • 验证 • 底层操作                                  | • 业务流程 • 状态管理                                  |
| **lib/**      | `lib/`           | 第三方库  | • 外部依赖                                                  | • 修改第三方代码                                       |

## 数据流转路径

1. Component → Query Hook → Service → apiClient/Utils
   不经过 Store。对于简单逻辑 Query = Core + Store + Service，所以也不需要经过 Core 了，Query 的缓存就是该服务器数据的权威来源。【服务端状态】
2. Component → useAuth Hook → Core → Service → apiClient/Utils
   Core 负责写 Store（isAuthenticated、isLoading、必要的用户概要），useAuth 读 Store。【复杂流程编排】

<Note> 依赖方向：Component → Store（读），Core → Store（写），Query Hook ⇏ Store（默认不写），Service ⇏ Store（禁止） </Note>
<Note> Core 直接调用 Service 层，不调用 Query 层 </Note>
<Note> Hook 可以直接调用 Query 层，Query 层的作用是数据获取/缓存，和 Core 层各有侧重点，复杂流程编排时再调用 Core 层</Note>
<Note> Store 不在“数据请求链路”中。它是客户端状态源（UI/会话），独立于 Query/Service。服务器状态（列表/详情/userinfo 等）用 TanStack Query 管理，不复制到 Store，避免“双写”和陈旧数据。</Note>

- Compoent 组件主要使用 shadcn，使用 yarn shadcn add \*\*\* 来添加新组件。
- types 分三种，一种是后端同步过来的类型定义，放在 `service/<module_name>/types.ts 下`，还有一种是仅在 slice 中业务逻辑用到的 types，放在 `web/src/store/slices/<module_name>/types.ts` 下，
  另一种是大多数前端用到的类型，全局共享类型定义，放在 `web/src/types/<module_name>` 下，
  最后是仅组件内使用的局部类型定义，放在组件文件顶部。

## Development Workflow

The recommended development setup is using the containerized environment, which can be managed through shell scripts or a Makefile.

### Getting Started

To start the development environment, use the following commands in the project root:

- **On Unix/Linux/macOS**: `./launch/dev.sh`
- **On Windows (PowerShell)**: `.\launch\dev.ps1`
- **Using Makefile**: `make dev`

These commands will set up all the necessary services, including the database and other infrastructure components.

### Running Tests

The backend has a comprehensive test suite. To run the tests, navigate to the `service` directory and use the following commands:

- **Run all tests**: `uv run pytest`
- **Run tests with coverage**: `uv run pytest --cov=src --cov=examples --cov-report=html`

### Code Quality

The project uses `pre-commit` for code formatting, linting, and type-checking. Before submitting any changes, ensure that the code quality checks pass by running the following command in the `service` directory:

`uv run pre-commit run --all-files`

## Project-Specific Conventions

- **Backend**: The backend follows a standard FastAPI project structure. Business logic is separated into different modules under the `core` directory, and database interactions are handled by the `repo` layer.
- **Frontend**: The frontend is built with React and uses `zustand` for state management. The main component is `Xyzen`, which can be controlled through the `useXyzen` hook.
- **Database Migrations**: Database migrations are managed with Alembic. When you make changes to the SQLModel definitions in `service/models`, you will need to generate a new migration script.

## Integration Points

- **LLM Providers**: The backend can be configured to use different LLM providers like Azure OpenAI, OpenAI, Anthropic, and Google. The configuration is managed in `service/internal/configs/llm.py`.
- **Authentication**: Authentication is handled by Casdoor, which is set up as part of the containerized environment.
- **Real-time Communication**: WebSocket is used for real-time chat functionalities, and Mosquitto (MQTT broker) is available for other real-time messaging needs.
