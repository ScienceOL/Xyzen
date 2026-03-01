# Backend Guide

## Directory Structure (`app/`)

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

## Environment Variables

- Prefix: `XYZEN_` for all variables.
- Nesting: Use `_` to separate levels; do not use `_` within a single segment.
- Naming: Use camelCase that matches config field names.
- Case: Parsing is case-insensitive, but prefer camelCase for clarity.

Examples:

- `XYZEN_SEARXNG_BaseUrl=http://127.0.0.1:8080` (correct)
- `XYZEN_SEARXNG_Base_Url=...` (incorrect: extra underscore splits a new level)
- `XYZEN_LLM_AZUREOPENAI_KEY=...` (provider segment is single camelCase token)
- `XYZEN_LLM_PROVIDERS=azure_openai,google_vertex` (values may use underscores)

## High Availability

The backend runs in a multi-Pod, multi-worker environment. Always consider high availability when writing backend logic:

- **Celery tasks may be delivered more than once** — Worker restarts and network jitter can cause the same task to be picked up by multiple workers. Tasks with side effects must have idempotency protection (Redis distributed lock / DB state guard). See the `exec_lock` implementation in `tasks/scheduled.py`.
- **Count-based quotas are soft limits** — There is no transactional lock between `SELECT count` and `INSERT`, so concurrent requests may briefly exceed the limit. Unless the business strictly cannot tolerate this, pessimistic locking is unnecessary.
- **API and Tool are two entry points** — Resource creation often has both a REST API path (`api/v1/`) and an LLM tool path (`tools/builtin/`). Quota checks and parameter validation must be applied in both; missing either allows the limit to be bypassed.
- **Chained scheduled tasks need a safety floor** — Celery ETA scheduling can be lost or drift after a worker restart. Chain-style scheduling (current task schedules the next upon completion) must clamp to a minimum interval to prevent rapid consecutive firing.
