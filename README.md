# Xyzen

AI Laboratory Server

[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/release/python-3130/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

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
