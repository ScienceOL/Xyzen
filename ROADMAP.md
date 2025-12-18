# Xyzen Roadmap

This roadmap outlines the development stages of the Xyzen AI Laboratory Server. It serves as a high-level guide for tracking major feature implementation and system architecture evolution.

## Phase 1: Core Consolidation (Current)
Focus: Cleaning up the legacy structure, unifying models, and establishing best practices.

- [ ] **Unified Agent System**: Complete the migration to a single `Agent` model for both regular and graph-based agents.
- [ ] **Idiomatic FastAPI Refactor**: Implement Dependency Injection (DI) for resource fetching and authorization across all API handlers.
- [ ] **Frontend State Management**: Finalize the migration of all server-side state to TanStack Query and clean up Zustand slices.
- [ ] **Error Handling**: Implement a global exception handler and unified error code system across backend and frontend.

## Phase 2: Agent Intelligence & Workflows
Focus: Expanding the capabilities of the agent engine.

- [ ] **LangGraph Orchestration**: Full integration of LangGraph for complex, stateful multi-agent workflows.
- [ ] **Advanced MCP Integration**: Dynamic discovery and management of Model Context Protocol (MCP) servers.
- [ ] **Tool Confirmation UI**: A robust interface for users to inspect and approve agent tool calls before execution.
- [ ] **Streaming Optimization**: Enhancing WebSocket performance for real-time agent thought process visualization.

## Phase 3: Knowledge Base & RAG
Focus: Providing agents with memory and specialized knowledge.

- [ ] **Vector Database Support**: Integration with PostgreSQL (pgvector) or a dedicated vector DB for RAG capabilities.
- [ ] **File Processing Pipeline**: Automated ingestion and chunking of documents (PDF, Markdown, Code).
- [ ] **Knowledge Graphs**: Exploring graph-based retrieval to complement vector search.

## Phase 4: Infrastructure & Scale
Focus: Making Xyzen production-ready.

- [ ] **Multi-Provider Support**: Seamless switching between OpenAI, Anthropic, Gemini, and local models (Ollama).
- [ ] **User Usage Tracking**: Monitoring token consumption and execution costs.
- [ ] **Deployment Templates**: Easy-to-use Docker Compose and Kubernetes configurations for various environments.

---

## Done ✅
- [x] **Project Foundation**: Initial FastAPI + SQLModel backend setup.
- [x] **Frontend Shell**: React + Tailwind + shadcn/ui dashboard layout.
- [x] **Basic Agent Chat**: Functional WebSocket-based chat with regular agents.
- [x] **Dockerized Environment**: Fully containerized development setup with PostgreSQL and MinIO.
