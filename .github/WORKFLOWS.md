# CI/CD Workflows Documentation

This document explains the CI/CD workflow design following industry best practices for separation of concerns and efficient development processes.

## Workflow Overview

Our CI/CD pipeline consists of two main workflows with distinct responsibilities:

### 1. Code Quality Checks (`.github/workflows/pre-commit.yaml`)

**Purpose**: Fast feedback on code quality issues using pre-commit hooks
**Triggers**: Every push and pull request to main branch
**Runtime**: ~2-3 minutes

**Approach**: **Pre-commit Hook Based** (Best Practice)
- Uses **identical pre-commit configuration** as local development
- Ensures **perfect consistency** between local and CI environments
- Single source of truth in `.pre-commit-config.yaml`

**Responsibilities**:
- **Python Backend**:
  - Ruff formatting and linting
  - Pyright static type analysis
- **Frontend (React/TypeScript)**:
  - Prettier code formatting
  - ESLint linting with TypeScript support
  - TypeScript type checking (`tsc --noEmit`)
- **General**:
  - File consistency checks (trailing whitespace, end-of-file, etc.)
  - YAML/JSON validation
  - Merge conflict detection

**Why pre-commit based**:
- ✅ **Perfect consistency**: Same checks locally and in CI
- ✅ **Single configuration**: No duplication between local and CI setup
- ✅ **Developer experience**: Developers see exact same results locally
- ✅ **Maintainability**: One place to update code quality rules

### 2. Comprehensive Test Suite (`.github/workflows/test.yaml`)

**Purpose**: Thorough testing and coverage analysis
**Triggers**: Every push and pull request to main/dev branches
**Runtime**: ~5-10 minutes

**Responsibilities**:
- **Unit Tests**: Complete test suite with coverage reporting
- **Matrix Testing**: Multiple Python versions (currently 3.13, expandable)
- **Integration Tests**: Database integration with PostgreSQL
- **Coverage Analysis**: HTML/XML coverage reports with Codecov integration
- **Artifact Management**: Coverage reports uploaded for review

**Why separate from code quality**:
- ✅ **Comprehensive coverage**: Full test execution without time pressure
- ✅ **Resource intensive**: Requires database services and longer execution time
- ✅ **Coverage analysis**: Detailed reporting and artifact generation
- ✅ **Multiple environments**: Matrix testing across different configurations

## Workflow Separation Benefits

### 1. **Fail Fast Principle**
```
Code Quality (2-3 min) → Test Suite (5-10 min)
     ↓                        ↓
   Quick fixes            Comprehensive validation
```

### 2. **Clear Responsibility Boundaries**
- **Code Quality**: "Is the code well-written?"
- **Test Suite**: "Does the code work correctly?"

### 3. **Optimal Resource Usage**
- Code quality checks run on every commit (lightweight)
- Full test suite runs when code quality passes (resource-intensive)

### 4. **Developer Workflow Optimization**
- Immediate feedback on style/typing issues
- No waiting for full test suite for simple formatting fixes
- Parallel execution possible when both pass

## Trigger Patterns

### Code Quality Workflow
```yaml
on:
  pull_request:
    branches: [main]
    paths:
      - "service/**"      # Backend changes
      - "web/**"          # Frontend changes
      - ".pre-commit-config.yaml"
      - ".github/workflows/pre-commit.yaml"
```

### Test Suite Workflow
```yaml
on:
  push:
    branches: [main, dev]  # Include dev branch for testing
    paths:
      - "service/**"       # Only backend changes trigger tests
      - ".github/workflows/test.yaml"
  pull_request:
    branches: [main, dev]
    paths:
      - "service/**"
      - ".github/workflows/test.yaml"
```

## Best Practices Implemented

### 1. **Concurrency Control**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
- Cancels redundant runs on new pushes
- Saves CI resources and reduces queue times

### 2. **Conditional Execution**
- Code quality checks run on frontend AND backend changes
- Test suite runs only on backend changes (no tests for frontend yet)
- Coverage upload only on PR/main branch (not every push)

### 3. **Artifact Management**
- Coverage reports uploaded with 7-day retention
- HTML and XML formats for different consumers
- Codecov integration for PR comments

### 4. **Error Handling**
- Matrix jobs use `fail-fast: false` for complete visibility
- Integration tests handle service dependencies
- Summary job provides consolidated status

## Migration from Previous Setup

**Before**: Single workflow ran everything (pre-commit + tests)
- ❌ Slow feedback on style issues
- ❌ Redundant test execution
- ❌ Mixed responsibilities
- ❌ Resource waste

**After**: Separated workflows with clear purposes
- ✅ Fast code quality feedback (2-3 min)
- ✅ Comprehensive testing when needed (5-10 min)
- ✅ Clear separation of concerns
- ✅ Optimal resource utilization

## Local Development Setup

### Installing Pre-commit Hooks
```bash
# Backend setup (run once)
cd service
uv sync --dev
uv run pre-commit install

# Frontend setup (run once)
cd ../web
yarn install
```

### Running Pre-commit Locally
```bash
# Run all hooks on all files
cd service && uv run pre-commit run --all-files

# Run hooks on staged files only
cd service && uv run pre-commit run

# Run specific hook
cd service && uv run pre-commit run ruff-check
cd service && uv run pre-commit run prettier
```

### Pre-commit Configuration (`.pre-commit-config.yaml`)

Our pre-commit setup includes:

**Python Backend Hooks**:
- `ruff-check` + `ruff-format`: Fast Python linting and formatting
- `pyright`: Static type checking with strict configuration

**Frontend Hooks**:
- `prettier`: Code formatting for JS/TS/JSON/CSS/Markdown
- `eslint`: Linting with TypeScript support and auto-fix
- `typescript-check`: Type checking with `tsc --noEmit`

**General Hooks**:
- File consistency (trailing whitespace, end-of-file, etc.)
- YAML/JSON validation, merge conflict detection

## Extending the Workflows

### Adding New Code Quality Checks
Edit `.pre-commit-config.yaml` (single source of truth):
```yaml
# Add new Python tools
- repo: https://github.com/pycqa/bandit
  rev: 1.7.5
  hooks:
    - id: bandit

# Add new frontend tools
- repo: https://github.com/pre-commit/mirrors-stylelint
  rev: v15.10.1
  hooks:
    - id: stylelint
```

### Adding New Test Types
Edit `.github/workflows/test.yaml`:
- Add end-to-end tests
- Include performance benchmarks
- Add additional service dependencies

### Frontend Testing
When frontend tests are added, extend test.yaml:
```yaml
- name: Run frontend tests
  working-directory: ./web
  run: |
    yarn test --coverage
```

## Pre-commit vs Manual CI Comparison

**❌ Manual CI Approach** (Previous):
```yaml
- name: Run Python linting
  run: uv run ruff check
- name: Run Python formatting
  run: uv run ruff format --check
- name: Run type checking
  run: uv run pyright
- name: Run frontend linting
  run: yarn lint
```

**✅ Pre-commit Based** (Current):
```yaml
- name: Run pre-commit hooks
  run: cd service && uv run pre-commit run --all-files
```

**Benefits**:
- **Single configuration** instead of duplicated CI steps
- **Perfect local/CI consistency**
- **Easier maintenance** - update once, applies everywhere
- **Automatic dependency management** by pre-commit
- **Faster CI setup** - pre-commit handles hook orchestration

This workflow design follows industry standards used by major projects like Django, FastAPI, and React, providing an optimal balance between speed, consistency, and developer experience.
