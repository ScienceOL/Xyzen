# Xyzen

This file provides guidance to LLMs when working with code in this repository.

## Project Overview

Xyzen is an AI Laboratory Server - a full-stack application with a Python FastAPI backend and React/TypeScript frontend. The project uses containerized development with Docker and modern development practices.

### Backend Service (`/service`)
- **Framework**: FastAPI with Uvicorn
- **Language**: Python 3.13 with strict type checking
- **ORM**: SQLModel with PostgreSQL (no-foreign-key model approach)
- **Database Pattern**: Repository pattern for all database operations
- **AI Integration**: LangChain-compatible provider system with LangGraph support (OpenAI, Azure OpenAI, Anthropic, Google GenAI)
- **Agent Framework**: LangGraph for complex multi-agent workflows and state management
- **MCP Support**: FastMCP integration for Model Context Protocol server functionality
- **Type Hints**: Modern Python union syntax (`str | None` instead of `Optional[str]`)
- **Testing**: Comprehensive test suite with pytest, async support

### Frontend Web Application (`/web`)
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with HeadlessUI components
- **State Management**: Zustand
- **Package Manager**: Yarn (via Corepack)
