<img src="https://storage.sciol.ac.cn/library/xyzen/coverage.png" style="width:100%; object-fit: contain;" />

# Xyzen

Your next agent platform for multi-agent orchestration, real-time chat, and document processing.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/release/python-3130/)
[![Code style: Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![Checked with pyright](https://microsoft.github.io/pyright/img/pyright_badge.svg)](https://microsoft.github.io/pyright/)
[![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![npm version](https://img.shields.io/npm/v/@sciol/xyzen.svg)](https://www.npmjs.com/package/@sciol/xyzen)
[![Pre-commit CI](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml)
[![Release](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml)
[![Test Suite](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml)
[![codecov](https://codecov.io/github/ScienceOL/Xyzen/graph/badge.svg?token=91W3GO7CRI)](https://codecov.io/github/ScienceOL/Xyzen)

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## Overview

Xyzen is an AI lab server built with FastAPI + LangGraph on the backend and React + Zustand on the frontend. It provides multi-agent orchestration, WebSocket streaming chat, and extensible provider + MCP integrations.

- Backend: `service/` (FastAPI, LangGraph, SQLModel, Celery)
- Frontend: `web/` (React, Zustand, shadcn/ui)
- Docs: `service/README.md`, `web/README.md`, `AGENTS.md`

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/ScienceOL/Xyzen.git
   cd Xyzen
   ```

2. Create environment configuration:

   ```bash
   cp docker/.env.example docker/.env.dev
   ```

3. Configure your LLM provider in `docker/.env.dev`:

   ```bash
   # Enable providers (comma-separated): azure_openai,openai,google,qwen
   XYZEN_LLM_providers=openai

   # OpenAI example
   XYZEN_LLM_OpenAI_key=sk-your-api-key
   XYZEN_LLM_OpenAI_endpoint=https://api.openai.com/v1
   XYZEN_LLM_OpenAI_deployment=gpt-4o
   ```

   See `docker/.env.example` for all available configuration options.

4. Start the development environment:

   ```bash
   ./launch/dev.sh        # Start in foreground (shows logs)
   ./launch/dev.sh -d     # Start in background (daemon mode)
   ./launch/dev.sh -s     # Stop containers
   ./launch/dev.sh -e     # Stop and remove containers
   ```

   Or use the Makefile:

   ```bash
   make dev              # Start in foreground
   make dev ARGS="-d"    # Start in background
   ```

The script will automatically set up all infrastructure services (PostgreSQL, Redis, Mosquitto, Casdoor) and launch development containers with hot reloading.

## Development

### Prerequisites for Contributing

- [uv](https://docs.astral.sh/uv/) for Python tools and pre-commit hooks
- Node.js with Yarn (via [Corepack](https://nodejs.org/api/corepack.html)) for frontend tools

## AI Assistant Rules

Xyzen uses a standardized instruction file for AI coding assistants to keep tool-specific rules aligned.

The master file is located at **[`AGENTS.md`](./AGENTS.md)**.

**Quick Setup:**

Run the interactive setup script to configure your AI tools:

```bash
./launch/setup-ai-rules.sh
```

This script will:

- Detect your system language (English/Chinese)
- Show current configuration status
- Let you select which AI tools to configure (Claude, Cursor, Windsurf, GitHub Copilot, Cline)
- Create symbolic links from `AGENTS.md` to each tool's expected config file

**Manual Setup:**

If you prefer manual configuration:

```bash
ln -s AGENTS.md CLAUDE.md                      # For Claude
ln -s AGENTS.md .cursorrules                   # For Cursor
ln -s AGENTS.md .windsurfrules                 # For Windsurf
mkdir -p .github && ln -s ../AGENTS.md .github/copilot-instructions.md  # For GitHub Copilot
ln -s AGENTS.md .clinerules                    # For Cline/Roo Code
```

## Contributing

Contributions are the core of open source! We welcome improvements and features.

### Running Tests

Xyzen has a comprehensive unit test suite. All PRs must introduce or update tests as appropriate and pass the full suite.

**Run all tests:**

```bash
cd service
uv run pytest
```

**Run tests with coverage:**

```bash
cd service
uv run pytest --cov=src --cov=examples --cov-report=html
```

**Run specific tests:**

```bash
cd service
uv run pytest tests/test_models/        # Run all model tests
uv run pytest -k "test_name"           # Run tests matching pattern
uv run pytest -m "unit"                # Run only unit tests
```

### Code Quality Checks

Xyzen uses `pre-commit` for code formatting, linting, and type-checking. All PRs must pass these checks (they run automatically in CI).

**Install pre-commit hooks** (done automatically by `./launch/dev.sh`):

```bash
uv run pre-commit install
```

**Note:** Pre-commit hooks use both `uv` (for Python/Ruff/Pyright) and `yarn` (for Prettier/ESLint/TypeScript checking).

**Run checks manually:**

```bash
uv run pre-commit run --all-files      # Run all hooks on all files
uv run pre-commit run                  # Run on staged files only
```

The pre-commit hooks include:

- **Python Backend:** Ruff (formatting & linting), Pyright (type checking)
- **Frontend:** Prettier, ESLint, TypeScript checking
- **General:** Trailing whitespace, end-of-file fixes, YAML validation

### Pull Request Process

1. Fork the repository on GitHub
2. Create a feature branch from `main`
3. Make your changes, including tests and documentation updates
4. Ensure all tests pass: `uv run pytest`
5. Ensure code quality checks pass: `uv run pre-commit run --all-files`
6. Commit your changes and push to your fork
7. Open a pull request against the `main` branch of `ScienceOL/Xyzen`

Please open an issue or discussion for questions or suggestions before starting significant work.
