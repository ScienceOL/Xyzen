# Xyzen Developer Guide

Xyzen is an AI Laboratory Server for multi-agent LLM orchestration, real-time chat, and document processing. Built with FastAPI + LangGraph (backend) and React + Zustand (frontend).

## Directory Structure

### Backend (`service/app/`)

```
agents/
  ├── factory.py                 # Agent creation and routing
  ├── types.py                   # Agent type definitions
  ├── utils.py                   # Shared utilities
  ├── builtin/                   # Builtin agent configs (JSON-based, v3 schema)
  │   ├── react.py               # Default ReAct agent config
  │   └── deep_research.py       # Multi-phase research agent config
  ├── components/                # Reusable ExecutableComponents
  │   ├── component.py           # ExecutableComponent base class
  │   ├── react.py               # ReAct component (tool-calling loop)
  │   └── deep_research/         # Deep research workflow components
  │       ├── components.py      # 4 components: clarify, brief, supervisor, report
  │       ├── prompts.py         # Prompt templates
  │       ├── state.py           # Structured output models
  │       └── utils.py           # Helpers
  └── graph/                     # GraphConfig compilation pipeline
      ├── builder.py             # Legacy v2 builder (used by compiler bridge)
      ├── canonicalizer.py       # Deterministic config normalization
      ├── compiler.py            # Canonical → v2 bridge → LangGraph
      ├── validator.py           # Structural validation
      └── upgrader.py            # v1/v2 → canonical migration
api/
  ├── v1/                        # REST API endpoints
  │   ├── agents.py              # Agent CRUD
  │   ├── files.py               # File upload/download
  │   ├── messages.py            # Message history
  │   └── sessions.py            # Session management
  └── ws/
      └── v1/chat.py             # WebSocket chat endpoint
core/
  ├── chat/
  │   ├── langchain.py           # LLM streaming, agent execution
  │   ├── stream_handlers.py     # Event types and emission helpers
  │   └── agent_event_handler.py # Agent execution context
  ├── providers/                 # LLM provider management (OpenAI, Anthropic, etc.)
  └── storage/                   # File storage services
models/                          # SQLModel definitions (no foreign keys)
repos/                           # Repository pattern for data access
schemas/
  ├── graph_config.py            # Canonical GraphConfig schema (the source of truth)
  ├── graph_config_legacy.py     # Legacy v2 schema (retained for bridge layer)
  ├── chat_event_types.py        # ChatEventType enum
  └── chat_event_payloads.py     # Event payload TypedDicts
mcp/                             # Model Context Protocol integration
tasks/                           # Celery background tasks
```

### Frontend (`web/src/`)

```
app/                             # Page components and routing
components/
  ├── layouts/
  │   └── components/
  │       ├── ChatBubble.tsx           # Message rendering
  │       ├── AgentExecutionTimeline.tsx # Multi-phase agent UI
  │       ├── AgentPhaseCard.tsx       # Phase display
  │       └── LoadingMessage.tsx       # Loading indicator
  ├── features/                  # Feature-specific components
  └── ui/                        # shadcn/ui design system
core/
  ├── chat/                      # Chat business logic
  └── session/                   # Session management
hooks/
  ├── queries/                   # TanStack Query hooks
  └── useXyzenChat.ts            # Chat hook
service/
  ├── xyzenService.ts            # WebSocket client
  └── sessionService.ts          # Session API
store/
  └── slices/
      ├── chatSlice.ts           # Chat state, event handling
      └── agentSlice.ts          # Agent management
types/
  ├── agentEvents.ts             # Agent event type definitions
  └── agents.ts                  # Agent interfaces
```

## Core Patterns

**Stateless Async Execution**: Decouple connection management (FastAPI) from heavy computation (Celery).

- State Offloading: API containers remain stateless. Ephemeral state (Queues, Pub/Sub channels) resides in Redis; persistent state in DB.
- Pub/Sub Bridge: Workers process tasks independently and broadcast results back to the specific API pod via Redis channels (chat:{connection_id}), enabling independent scaling of Web and Worker layers.

**No-Foreign-Key Database**: Use logical references (`user_id: str`) instead of FK constraints. Handle relationships in service layer.

**Repository Pattern**: Data access via `repos/` classes. Business logic in `core/` services.

**Frontend Layers**:

- Sever-Side Status: Components (UI only) → Hooks → Core (business logic) → ReactQuery (data cache) → Service (HTTP/WS)/Store (Zustand)
- Client-Side Status: Components (UI only) → Hooks → Core (business logic) → read Service (HTTP/WS) → write to Store (Zustand)

## Agent System

### Agent Types

| Type          | Key             | Description                                      |
| ------------- | --------------- | ------------------------------------------------ |
| ReAct         | `react`         | Default tool-calling agent (LLM + tool loop)     |
| Deep Research | `deep_research` | Multi-phase research with 4 component nodes      |
| Custom        | `graph`         | User-defined graph configuration                 |

### Architecture

All agents (builtin and user-defined) follow the same unified path:

1. Resolve GraphConfig (from DB `agent.graph_config` or builtin registry)
2. Parse and canonicalize to canonical schema (`schemas/graph_config.py`)
3. Validate graph structure (`graph/validator.py`)
4. Compile via bridge: canonical → v2 → LangGraph (`graph/compiler.py` → `graph/builder.py`)
5. Return `(CompiledStateGraph, AgentEventContext)` for streaming execution

```
factory.create_chat_agent()
  → _resolve_agent_config()            # DB config or builtin fallback
  → _inject_system_prompt()            # Merge platform + node prompts
  → _build_graph_agent()
      → GraphCompiler                  # canonical → v2 bridge
          → GraphBuilder               # v2 → LangGraph
              → CompiledStateGraph     # Ready to stream
```

### Builtin Agents

Agents are defined as JSON configs using the canonical GraphConfig schema, not as Python classes.
Configs live in `agents/builtin/` and reference ExecutableComponents from `agents/components/`.

### Components

Components are reusable subgraphs registered in a global `ComponentRegistry`.
They declare `required_capabilities` for automatic tool filtering.
GraphBuilder resolves component references at compile time via `component_registry.resolve(key, version)`.

### Adding a New Builtin Agent

1. Create config in `agents/builtin/my_agent.py` using `parse_graph_config({...})`
2. Register in `agents/builtin/__init__.py` via `_register_builtin("my_agent", config)`
3. If the agent needs custom components, add them under `agents/components/`
4. Register components in `agents/components/__init__.py` → `ensure_components_registered()`

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

### Frontend State

```typescript
interface Message {
  id: string;
  content: string;
  agentExecution?: {
    agentType: string; // "react", "deep_research"
    status: "running" | "completed" | "failed";
    phases: Array<{
      id: string; // Node ID
      status: "running" | "completed";
      streamedContent: string; // Accumulated content
    }>;
    currentNode?: string;
  };
}
```

### Content Routing

**Multi-phase agents** (deep_research): Content → `phase.streamedContent` → `AgentExecutionTimeline`

**Simple agents** (react): Content → `phase.streamedContent` → `ChatBubble` renders directly

**Key**: For react agents without `node_start` events, frontend creates fallback "Response" phase in `streaming_start` handler.

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
just type-backend                # uv run pyright .
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
just logs-f worker               # Follow Celery worker logs

# Other commands
just logs                        # View all service logs
just ps                          # Show running containers
just restart <service>           # Restart a service
just rebuild <service>           # Rebuild and restart service
just exec <service>              # Shell into container
```

**Container names**: `sciol-xyzen-{service}-1` (e.g., `sciol-xyzen-service-1`, `sciol-xyzen-worker-1`)

## Code Style

**Python**: Use `list[T]`, `dict[K,V]`, `str | None` (not `List`, `Dict`, `Optional`)

**TypeScript**: Strict typing, business logic in `core/` not components

**Both**: Async by default, comprehensive error handling

## Internationalization

The frontend supports multiple languages (`en`, `zh`, `ja`). Translations are modularized into separate JSON files under `web/src/i18n/locales/{lang}/`.

### Translation Modules

| File               | Scope                                      |
| ------------------ | ------------------------------------------ |
| `app.json`         | Navigation, toolbar, model selector, input |
| `common.json`      | Shared actions (OK, Cancel, Loading)       |
| `settings.json`    | Settings modal, theme/language config      |
| `marketplace.json` | Agent marketplace listing and details      |
| `knowledge.json`   | File management, uploads, knowledge sets   |
| `mcp.json`         | MCP server connection and management       |
| `agents.json`      | Agent CRUD forms and validation            |

### Workflow

1.  **Add Keys**: Add new strings to the appropriate `en/*.json` file.
2.  **Sync Languages**: Ensure `zh/*.json` and `ja/*.json` have matching keys.
3.  **Component Usage**: Access using the `filename` as a prefix.

```typescript
// Example: accessing "ok" from common.json
const { t } = useTranslation();
<Button>{t("common.ok")}</Button>;
```

## Backend Environment Variables

- Prefix: `XYZEN_` for all variables.
- Nesting: Use `_` to separate levels; do not use `_` within a single segment.
- Naming: Use camelCase that matches config field names.
- Case: Parsing is case-insensitive, but prefer camelCase for clarity.

Examples:

- `XYZEN_SEARXNG_BaseUrl=http://127.0.0.1:8080` (correct)
- `XYZEN_SEARXNG_Base_Url=...` (incorrect: extra underscore splits a new level)
- `XYZEN_LLM_AZUREOPENAI_KEY=...` (provider segment is single camelCase token)
- `XYZEN_LLM_PROVIDERS=azure_openai,google_vertex` (values may use underscores)

## Git Commit Rules

This project has pre-commit hooks (pyright, ruff) that can fail on partially-staged files. Follow this workflow for multi-file refactors:

1. **Verify final state first**: Run `just lint-backend`, `just type-backend`, and `just test-backend` on the full working tree before committing.
2. **Commit without verify**: Use `git commit --no-verify` to bypass pre-commit hooks that would fail on partial staging.
3. **Logical split**: Group changes into separate logical commits (e.g., schema renames, import updates, test updates).
4. **Conventional commits**: Use `feat:`, `fix:`, `refactor:`, `chore:` prefixes matching the existing commit history.
