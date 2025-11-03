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

## Contributing

Contributions are the core of open source! We welcome improvements and features.

### Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (Recommended for environment management)

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/scienceol/xyzen
   cd xyzen
   ```

2. Create and sync the environment:

   ```bash
   uv sync
   ```

   This installs all dependencies, including dev tools.

3. Activate the virtual environment (e.g., `source .venv/bin/activate` or via your IDE).

### Unit Tests

FastMCP has a comprehensive unit test suite. All PRs must introduce or update tests as appropriate and pass the full suite.

Run tests using pytest:

```bash
pytest
```

or if you want an overview of the code coverage

```bash
uv run pytest --cov=src --cov=examples --cov-report=html
```

### Static Checks

FastMCP uses `pre-commit` for code formatting, linting, and type-checking. All PRs must pass these checks (they run automatically in CI).

Install the hooks locally:

```bash
uv run pre-commit install
```

The hooks will now run automatically on `git commit`. You can also run them manually at any time:

```bash
pre-commit run --all-files
# or via uv
uv run pre-commit run --all-files
```

### Pull Requests

1. Fork the repository on GitHub.
2. Create a feature branch from `main`.
3. Make your changes, including tests and documentation updates.
4. Ensure tests and pre-commit hooks pass.
5. Commit your changes and push to your fork.
6. Open a pull request against the `main` branch of `jlowin/fastmcp`.

Please open an issue or discussion for questions or suggestions before starting significant work!
