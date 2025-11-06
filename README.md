# Xyzen

AI Laboratory Server

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/release/python-3130/)
[![Code style: Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![Checked with pyright](https://microsoft.github.io/pyright/img/pyright_badge.svg)](https://microsoft.github.io/pyright/)
[![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![npm version](https://img.shields.io/npm/v/@sciol/xyzen.svg)](https://www.npmjs.com/package/@sciol/xyzen)
[![Pre-commit CI](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml)
[![Docker Build](https://github.com/ScienceOL/Xyzen/actions/workflows/docker-build.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/docker-build.yaml)
[![Test Suite](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml)

## Getting Started

Xyzen supports two development approaches:

1. **Containerized Development** (Recommended) - Full-stack development with Docker
2. **Local Development** - Backend/frontend development with local tools

### Prerequisites

- **For Containerized Development:**
  - Docker and Docker Compose
  - [uv](https://docs.astral.sh/uv/) for pre-commit hooks

- **For Local Development:**
  - Python 3.13+
  - [uv](https://docs.astral.sh/uv/) for Python package management
  - Node.js with Yarn (via Corepack) for frontend development

## Containerized Development (Recommended)

The easiest way to get started with Xyzen is using the containerized development environment. This automatically sets up all services (PostgreSQL, Mosquitto, Casdoor) and development tools.

### Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/ScienceOL/Xyzen.git
   cd Xyzen
   ```

2. Start the development environment:

   **On Unix/Linux/macOS:**
   ```bash
   ./launch/dev.sh
   ```

   **On Windows (PowerShell):**
   ```powershell
   .\launch\dev.ps1
   ```

   Or use the Makefile:
   ```bash
   make dev              # Start in foreground (shows logs)
   make dev ARGS="-d"    # Start in background (daemon mode)
   make dev ARGS="-s"    # Stop containers (without removal)
   make dev ARGS="-e"    # Stop and remove containers
   ```

The script will automatically:
- Check Docker and validate `.env.dev` file
- Set up global Sciol virtual environment at `~/.sciol/venv`
- Install and configure pre-commit hooks
- Create VS Code workspace configuration
- Start infrastructure services (PostgreSQL, Mosquitto, Casdoor)
- Launch development containers with hot reloading

### Container Development Options

**Start in foreground (see logs):**
```bash
./launch/dev.sh
```

**Start in background:**
```bash
./launch/dev.sh -d
```

**Stop containers:**
```bash
./launch/dev.sh -s
```

**Stop and remove containers:**
```bash
./launch/dev.sh -e
```

**Show help:**
```bash
./launch/dev.sh -h
```

## Local Development

For development without Docker, you can run the backend and frontend services locally.

### Backend Setup

1. Navigate to the service directory:

   ```bash
   cd service
   ```

2. Install dependencies:

   ```bash
   uv sync --dev
   ```

3. Run the development server:

   ```bash
   uv run python -m app.main
   ```

### Frontend Setup

1. Navigate to the web directory:

   ```bash
   cd web
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Run the development server:

   ```bash
   yarn dev
   ```

   The frontend will be available at http://localhost:32233

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

**Install pre-commit hooks** (done automatically by `make dev` or `dev.sh`):
```bash
cd service
uv run pre-commit install
```

**Run checks manually:**
```bash
cd service
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

Please open an issue or discussion for questions or suggestions before starting significant work!
