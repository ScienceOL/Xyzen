# Xyzen Service

Backend service for Xyzen (FastAPI). It powers streaming chat, multi-agent execution, MCP tool integration, and provider-based LLM configuration.

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## Key Features

- FastAPI + WebSocket streaming chat
- Multi-provider LLM routing (OpenAI, Azure OpenAI, Anthropic, Google)
- LangChain/LangGraph agents with tool calling
- SQLModel + Alembic persistence for sessions, topics, messages
- Docker-first development and deployment

## Directory Guide

- `app/main.py`: FastAPI application entry
- `app/api/v1`: REST API endpoints
- `app/api/ws/v1`: WebSocket endpoints
- `app/core/chat`: Streaming execution and agent runtime
- `app/core/providers`: Provider configuration and routing
- `app/models`: SQLModel entities
- `app/repos`: Repository data access
- `app/schemas`: Pydantic/TypedDict payloads
- `app/mcp`: Model Context Protocol integration
- `app/tasks`: Celery background tasks
- `migrations/`: Alembic migrations

## Quick Start (Docker)

Use the root dev launcher:

```bash
./launch/dev.sh     # foreground
./launch/dev.sh -d  # background
```

Service endpoints after startup:

- Swagger: `http://localhost:48196/xyzen/api/docs`
- OpenAPI: `http://localhost:48196/xyzen/api/openapi.json`
- Health: `http://localhost:48196/xyzen/api/health`

## Environment

Dev compose reads `docker/.env.dev`. Config uses `XYZEN_`-prefixed variables.

Common examples:

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

## API & WebSocket

- REST base: `/xyzen/api/v1`
  - `GET /auth/*`
  - `GET /providers/*`
  - `GET /sessions/*`
  - `GET /topics/*`
  - `GET /agents/*`
  - `GET /mcps/*`
  - Health: `/xyzen/api/health`
- WebSocket base: `/xyzen/ws/v1`
  - Chat: `/chat/sessions/{session_id}/topics/{topic_id}`
  - MCP updates: `/mcp/*`

## Database & Migrations

- Migrations run on startup via Alembic.
- PostgreSQL and SQLite are supported (`XYZEN_DATABASE_ENGINE`).

Optional manual migrations:

```bash
uv run alembic revision -m "your message" --autogenerate
uv run alembic upgrade head
```

## LLM Providers & MCP

- Provider config is loaded from `app/core/providers` and `internal/configs`.
- MCP servers are registered under `app/mcp` and wired into agent execution.

## Troubleshooting

- Database errors: verify `XYZEN_DATABASE_*` and container networking.
- Swagger unavailable: confirm `XYZEN_PORT` and Docker port mappings.
- Model errors: check provider keys/endpoints and session configuration.
- MCP tool failures: ensure MCP server health and auth settings.
