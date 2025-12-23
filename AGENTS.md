# Xyzen AGENTS.md

This file provides guidance for AI Agents and LLMs working on the Xyzen codebase. Follow these instructions to ensure consistency, quality, and maintainability.

## Project Overview

Xyzen is an AI Laboratory Server - a full-stack application with a Python FastAPI backend and React/TypeScript frontend. The project uses containerized development with Docker and modern development practices.

## Code Style & Philosophy

**Goal:** Write professional, scalable, and clean code.

### Frontend (`/web`)

- **Architecture:** Follow the **Layered Architecture**:
  1.  **Component** (`components/`): UI rendering only. No business logic or direct API calls.
  2.  **Hook** (`hooks/`): Encapsulates capabilities, subscribes to Store.
  3.  **Core** (`core/`) ⭐: **The Heart.** Contains all business logic, flow orchestration, and side effects.
  4.  **Service** (`service/`): Pure HTTP/WebSocket requests.
  5.  **Store** (`store/`): Client-side state (UI/Session) using **Zustand**.
  6.  **Query** (`hooks/queries/`): Server state caching using **TanStack Query**.
- **State Management Rules:**
  - **Server State:** Use TanStack Query. Do NOT duplicate server data into Zustand.
  - **Client State:** Use Zustand for UI state (modals, theme, active panel).
  - **Data Flow:** Component → Query Hook → Service. (Bypass Store for data fetching).
- **UI Library:** Use **shadcn/ui** components located in `src/components/ui`. Use Tailwind CSS for styling.
- **Type Definitions:**
  - Backend types: `service/<module>/types.ts`
  - Slice types: `store/slices/<module>/types.ts`
  - Global types: `types/<module>`

### Backend (`/service`)

- **Framework:** FastAPI with Uvicorn.
- **Language:** Python 3.12. Use modern union syntax (`str | None` instead of `Optional[str]`).
- **Database:** **SQLModel** with PostgreSQL.
  - **Constraint:** Use a **No-Foreign-Key** model approach.
  - **Pattern:** Use the **Repository Pattern** (`repos/`) for all database operations.
- **AI/Agents:**
  - **Framework:** **LangGraph** for multi-agent workflows and state management.
  - **Integration:** LangChain-compatible provider system.
  - **MCP:** FastMCP integration for Model Context Protocol.
- **Testing:**
  - **Runner:** `uv run pytest`.
  - **Structure:**
    - `tests/unit/`: Logic tests without external dependencies.
    - `tests/integration/`: API and database integration tests.
  - **Style:**
    - Use `async_client` fixture for API tests.
    - Use `db_session` fixture for database operations.
    - Ensure tests clean up created resources or rely on database transaction rollbacks.

## Project Structure

### Backend (`/service`)

```
service/
├── app/
│   ├── main.py             # Entry point
│   ├── agents/             # Builtin Agents
│   ├── api/v1/             # API Endpoints
│   ├── core/               # Business Logic, Chat & LangChain logic
│   ├── models/             # SQLModel definitions (No FKs)
│   ├── repos/              # Database Repositories
│   └── schemas/            # Pydantic Schemas
├── tests/                  # Tests
├── migrations/             # Alembic Migrations
├── alembic.ini
└── pyproject.toml
```

### Frontend (`/web`)

```
web/src/
├── app/                    # Pages/Routes
├── components/             # React Components
│   ├── features/           # Feature-specific components
│   ├── knowledge/          # Knowledge Base components
│   ├── layouts/            # Layout wrappers
│   ├── preview/            # File Preview System
│   └── ui/                 # shadcn UI components
├── core/                   # Core Business Logic
├── hooks/                  # Custom Hooks
├── service/                # API Services
└── store/                  # Zustand Store
```

## Dev Environment Tips

- **Docker First:** The project is designed to run in Docker.
  - Start Dev: `./launch/dev.sh`
- **Frontend Commands:**
  - `yarn lint`: Check for linting errors. **Run this after every major change.**
  - `yarn type-check`: Verify TypeScript types.
  - `yarn shadcn add <component>`: Add new UI components.
- **Backend Commands:**
  - `uv run pytest`: Run backend tests.
  - `uv run pyright .`: Run static analysis.

## Important Things to Remember

1.  **Linting is Critical:** The frontend relies heavily on TypeScript and ESLint. Always run `yarn lint` and `yarn type-check` in the `web/` directory to catch errors early.
2.  **No Direct S3 Access in Browser:** When previewing or downloading files in the frontend, do NOT use direct S3/MinIO URLs (e.g., `http://host.docker.internal...`). Use the backend proxy endpoints (`/xyzen/api/v1/files/.../download`) to ensure accessibility and correct authentication.
3.  **Strict Layering:** Do not put business logic in Components. Do not put HTTP requests in Components. Respect the frontend layering.
4.  **Database:** Remember the "no foreign key" rule in SQLModel definitions. Handle relationships logically in the service/repo layer.
