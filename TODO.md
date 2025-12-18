# Xyzen Task Tracker (TODO)

This file tracks tactical, short-term tasks and immediate technical debt. For high-level milestones, see `ROADMAP.md`.

## 🛠️ Immediate Priorities
- [ ] **Dependency Injection Refactor**: Move `auth_service` and `agent` fetching into FastAPI dependencies in `agents.py`.
- [ ] **Agent Repository Cleanup**: Remove legacy methods in `AgentRepository` that supported the old unified agent service (e.g., `get_agent_with_mcp_servers`).
- [ ] **Frontend Type Alignment**: Update `web/src/types/agents.ts` to match the simplified `AgentReadWithDetails` model from the backend.

## 🚀 Backend Tasks
- [ ] **Pydantic V2 Migration**: Verify all SQLModels and Schemas are utilizing Pydantic V2 features optimally.
- [ ] **Logging Middleware**: Add request/response logging for better debugging in the Docker environment.
- [ ] **Auth Error Mapping**: Finish mapping `ErrCodeError` to appropriate FastAPI `HTTPException` responses in `middleware/auth`.

## 🎨 Frontend Tasks
- [ ] **TanStack Query Refactor**: Move agent fetching from `agentSlice.ts` (Zustand) to a dedicated hook in `hooks/queries/useAgents.ts`.
- [ ] **AddAgentModal UI**: Allow users to select a specific LLM Provider during the creation of a regular agent.
- [ ] **Loading States**: Add skeleton loaders to the `AgentExplorer` sidebar.

## 🧪 Testing & Quality
- [ ] **Backend Unit Tests**: Add test cases for the newly unified `get_agent` endpoint.
- [ ] **Frontend Linting**: Fix existing `yarn lint` warnings in `web/src/components/layouts/ChatToolbar.tsx`.
- [ ] **API Documentation**: Update docstrings in `handler/api/v1/` to ensure Swagger UI is accurate.

## ✅ Completed Tasks
- [x] **Agent Unification**: Unified `get_agent` endpoint to return `AgentReadWithDetails` and removed `UnifiedAgentRead` dependencies.
- [x] **Default Agent Cloning**: Implemented logic in `SystemAgentManager` to clone system agents as user-owned default agents.
- [x] **Tag-based Identification**: Updated frontend (Chat, Agent List, Avatars) to identify default agents via tags (e.g., `default_chat`) rather than hardcoded UUIDs.
- [x] **Workshop Removal**: Completely removed the legacy "Workshop" feature from both backend and frontend to simplify the core agent experience.
- [x] **Policy Update**: Updated `AgentPolicy` to allow reading of system-scoped reference agents.
