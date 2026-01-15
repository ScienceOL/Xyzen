# Xyzen Developer Guide

Xyzen is an AI Laboratory Server for multi-agent LLM orchestration, real-time chat, and document processing. Built with FastAPI + LangGraph (backend) and React + Zustand (frontend).

## Directory Structure

### Backend (`service/app/`)

```
agents/
  ├── system/                    # Built-in system agents
  │   ├── react/                 # Default ReAct agent (LangChain create_agent)
  │   └── deep_research/         # Multi-phase research agent
  ├── base_graph_agent.py        # Abstract base for graph agents
  ├── factory.py                 # Agent creation and routing
  ├── graph_builder.py           # Dynamic graph construction from config
  └── types.py                   # Agent type definitions
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
* State Offloading: API containers remain stateless. Ephemeral state (Queues, Pub/Sub channels) resides in Redis; persistent state in DB.
* Pub/Sub Bridge: Workers process tasks independently and broadcast results back to the specific API pod via Redis channels (chat:{connection_id}), enabling independent scaling of Web and Worker layers.

**No-Foreign-Key Database**: Use logical references (`user_id: str`) instead of FK constraints. Handle relationships in service layer.

**Repository Pattern**: Data access via `repos/` classes. Business logic in `core/` services.

**Frontend Layers**:
* Sever-Side Status: Components (UI only) → Hooks → Core (business logic) → ReactQuery (data cache) → Service (HTTP/WS)/Store (Zustand)
* Client-Side Status: Components (UI only) → Hooks → Core (business logic) → read Service (HTTP/WS) → write to Store (Zustand)

## Agent System

### Agent Types

| Type          | Key             | Description                                             |
| ------------- | --------------- | ------------------------------------------------------- |
| ReAct         | `react`         | Default agent using LangChain's prebuilt `create_agent` |
| Deep Research | `deep_research` | Multi-phase research with explicit graph nodes          |
| Custom        | `graph`         | User-defined graph configuration                        |

### Creating a System Agent

```python
# service/app/agents/system/my_agent/agent.py
class MyAgent(BaseBuiltinGraphAgent):
    key = "my_agent"
    name = "My Agent"
    description = "Does something useful"

    def build_graph(self) -> CompiledStateGraph:
        workflow = StateGraph(MyState)
        workflow.add_node("process", self._process)
        workflow.add_edge(START, "process")
        workflow.add_edge("process", END)
        return workflow.compile()
```

### Agent Factory Flow

1. `factory.py:create_chat_agent()` resolves agent type from config
2. For system agents: looks up `system_agent_registry.get_instance(key)`
3. Returns `(CompiledStateGraph, AgentEventContext)` for streaming execution

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
    status: 'running' | 'completed' | 'failed';
    phases: Array<{
      id: string; // Node ID
      status: 'running' | 'completed';
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

```bash
# Backend (from service/)
uv run pytest                    # Run tests
uv run pyright .                 # Type checking

# Frontend (from web/)
yarn dev                         # Dev server
yarn type-check                  # TypeScript check
yarn lint                        # ESLint
yarn test                        # Vitest

# Full stack (from root)
./launch/dev.sh -d               # Start all services
```

## Database Migrations

When creating or running migrations, use `docker exec` to access the container:

```bash
# Generate migration
docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic revision --autogenerate -m 'Description'"
# Apply migrations
docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic upgrade head"
```
**Note**: Register new models in `models/__init__.py` before generating migrations.

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
<Button>{t('common.ok')}</Button>;
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
