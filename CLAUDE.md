# Xyzen Developer Guide

Xyzen is an AI Laboratory Server for multi-agent LLM orchestration, real-time chat, and document processing. Built with FastAPI + LangGraph (backend) and React + Zustand (frontend).

In the dev environment (`just dev`), the FastAPI service and the web frontend support hot-reload — code changes take effect automatically. The Celery worker does **not** hot-reload; run `just rebuild celery` only when your changes touch files under `tasks/` or other Celery-consumed code paths.

## Core Patterns

**Stateless Async Execution**: Decouple connection management (FastAPI) from heavy computation (Celery).

- State Offloading: API containers remain stateless. Ephemeral state (Queues, Pub/Sub channels) resides in Redis; persistent state in DB.
- Pub/Sub Bridge: Workers process tasks independently and broadcast results back to the specific API pod via Redis channels (chat:{connection_id}), enabling independent scaling of Web and Worker layers.

**No-Foreign-Key Database**: Use logical references (`user_id: str`) instead of FK constraints. Handle relationships in service layer.

**Repository Pattern**: Data access via `repos/` classes. Business logic in `core/` services.

## Streaming Event System

### Event Flow (Backend → Frontend)

```
loading/processing  →  Show loading indicator
agent_start         →  Create agentExecution message
node_start          →  Create phase in agentExecution.phases
streaming_start     →  Mark message as streaming
streaming_chunk     →  Append to phase.streamedContent
node_end            →  Mark phase completed
streaming_end       →  Finalize streaming
agent_end           →  Mark execution completed
message_saved       →  Confirm DB persistence
```

### Key Files

| File                                                   | Purpose                         |
| ------------------------------------------------------ | ------------------------------- |
| `service/app/core/chat/langchain.py`                   | Streaming logic, event emission |
| `service/app/core/chat/stream_handlers.py`             | Event types and handlers        |
| `web/src/store/slices/chatSlice.ts`                    | Event handling, state updates   |
| `web/src/components/layouts/components/ChatBubble.tsx` | Message rendering               |

## Development Commands

This project uses [just](https://github.com/casey/just) as a command runner. Run `just --list` to see all available commands.

```bash
# Development environment
just dev                         # Start all services in background
just stop                        # Stop containers (without removing)
just down                        # Stop and remove all containers

# Backend (runs in service/ directory)
just test-backend                # uv run pytest
just test-backend-cov            # uv run pytest --cov
just type-backend                # uv run basedpyright .
just lint-backend                # uv run ruff check .
just fmt-backend                 # uv run ruff format .
just check-backend               # Run all backend checks

# Frontend (runs in web/ directory)
just dev-web                     # yarn dev
just type-web                    # yarn type-check
just lint-web                    # yarn lint
just test-web                    # yarn test
just check-web                   # Run all frontend checks

# Full stack
just lint                        # Run all linters
just test                        # Run all tests
just check                       # Run all checks
```

## Database Migrations

Migrations run inside the `sciol-xyzen-service-1` container via `docker exec`:

```bash
just migrate "Description"       # alembic revision --autogenerate -m "..."
just migrate-up                  # alembic upgrade head
just migrate-down                # alembic downgrade -1
just migrate-history             # alembic history
just migrate-current             # alembic current
```

**Note**: Register new models in `models/__init__.py` before generating migrations.

## Database Queries

Database commands run against `sciol-xyzen-postgresql-1` container (credentials: `postgres/postgres`, database: `postgres`):

```bash
just db-tables                   # psql -c "\dt"
just db-query "SELECT ..."       # psql -c "SELECT ..."
just db-shell                    # Interactive psql shell
```

## Docker Commands

Docker compose uses `docker/docker-compose.base.yaml` + `docker/docker-compose.dev.yaml` with `docker/.env.dev`:

```bash
# Commonly used - check API server and Celery worker logs
just logs-f service              # Follow FastAPI server logs
just logs-f celery               # Follow Celery worker logs

# Other commands
just logs                        # View all service logs
just ps                          # Show running containers
just restart <service>           # Restart a service
just rebuild <service>           # Rebuild and restart service
just exec <service>              # Shell into container
```

**Container names**: `sciol-xyzen-{service}-1` (e.g., `sciol-xyzen-service-1`, `sciol-xyzen-celery-1`)

## Code Style

**Python**: Use `list[T]`, `dict[K,V]`, `str | None` (not `List`, `Dict`, `Optional`)

**TypeScript**: Strict typing, business logic in `core/` not components

**Both**: Async by default, comprehensive error handling

## Git Commit Rules

**NEVER use `--no-verify`.** Pre-commit hooks (basedpyright, ruff) exist to enforce code quality. Bypassing them is not acceptable under any circumstances — not for partial staging, not for "quick fixes", not for any reason. If the hooks fail, fix the code until they pass.

Workflow for committing:

1. **Fix all issues first**: Run `just lint-backend`, `just type-backend`, and `just test-backend` on the full working tree. All must pass before committing.
2. **Stage and commit normally**: Use `git commit` (without `--no-verify`). Let the pre-commit hooks run and verify your code.
3. **If hooks fail, fix the code**: Do not bypass. Fix lint errors, type errors, or formatting issues, then re-stage and commit again.
4. **Logical split**: Group changes into separate logical commits (e.g., schema renames, import updates, test updates).
5. **Conventional commits**: Use `feat:`, `fix:`, `refactor:`, `chore:` prefixes matching the existing commit history.
