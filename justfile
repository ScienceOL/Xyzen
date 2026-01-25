# Xyzen Development Commands
# Run `just --list` to see all available commands

# Default recipe: show available commands
default:
    @just --list

# =============================================================================
# Development Environment
# =============================================================================

# Start all services in background (docker)
dev:
    ./launch/dev.sh -d

# Start all services in foreground
dev-fg:
    ./launch/dev.sh

# Stop all containers (without removing)
stop:
    ./launch/dev.sh -s

# Stop and remove all containers
down:
    ./launch/dev.sh -e

# Start only infrastructure services (postgres, redis, etc.)
infra:
    ./launch/middleware.sh

# =============================================================================
# Backend (service/)
# =============================================================================

# Run backend tests
test-backend *args='':
    cd service && uv run pytest {{ args }}

# Run backend tests with coverage
test-backend-cov:
    cd service && uv run pytest --cov

# Type check backend code
type-backend:
    cd service && uv run pyright .

# Lint backend code
lint-backend:
    cd service && uv run ruff check .

# Format backend code
fmt-backend:
    cd service && uv run ruff format .

# Run all backend checks (lint + type + test)
check-backend: lint-backend type-backend test-backend

# =============================================================================
# Frontend (web/)
# =============================================================================

# Start frontend dev server
dev-web:
    cd web && yarn dev

# Run frontend tests
test-web *args='':
    cd web && yarn test {{ args }}

# Type check frontend code
type-web:
    cd web && yarn type-check

# Lint frontend code
lint-web:
    cd web && yarn lint

# Format frontend code
fmt-web:
    cd web && yarn prettier

# Build frontend for production
build-web:
    cd web && yarn build

# Build frontend as library
build-lib:
    cd web && yarn build:lib

# Run all frontend checks (lint + type + test)
check-web: lint-web type-web test-web

# =============================================================================
# Full Stack
# =============================================================================

# Run all linters
lint: lint-backend lint-web

# Run all type checks
type-check: type-backend type-web

# Run all tests
test: test-backend test-web

# Run all formatters
fmt: fmt-backend fmt-web

# Run all checks (lint + type + test)
check: check-backend check-web

# =============================================================================
# Database & Migrations
# =============================================================================

# Generate a new migration
migrate message:
    docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic revision --autogenerate -m '{{ message }}'"

# Apply all pending migrations
migrate-up:
    docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic upgrade head"

# Rollback one migration
migrate-down:
    docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic downgrade -1"

# Show migration history
migrate-history:
    docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic history"

# Show current migration version
migrate-current:
    docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic current"

# List all database tables
db-tables:
    docker exec sciol-xyzen-postgresql-1 psql -U postgres -d postgres -c "\dt"

# Run a SQL query against the database
db-query query:
    docker exec sciol-xyzen-postgresql-1 psql -U postgres -d postgres -c "{{ query }}"

# Open psql shell
db-shell:
    docker exec -it sciol-xyzen-postgresql-1 psql -U postgres -d postgres

# =============================================================================
# Docker
# =============================================================================

# View service logs (all services)
logs *args='':
    docker compose -f docker/docker-compose.base.yaml -f docker/docker-compose.dev.yaml --env-file docker/.env.dev logs {{ args }}

# View service logs and follow
logs-f *args='':
    docker compose -f docker/docker-compose.base.yaml -f docker/docker-compose.dev.yaml --env-file docker/.env.dev logs -f {{ args }}

# Show running containers
ps:
    docker compose -f docker/docker-compose.base.yaml -f docker/docker-compose.dev.yaml --env-file docker/.env.dev ps

# Restart a specific service
restart service:
    docker compose -f docker/docker-compose.base.yaml -f docker/docker-compose.dev.yaml --env-file docker/.env.dev restart {{ service }}

# Rebuild and restart services
rebuild *services='':
    docker compose -f docker/docker-compose.base.yaml -f docker/docker-compose.dev.yaml --env-file docker/.env.dev up -d --build {{ services }}

# Execute command in service container
exec service *cmd='sh':
    docker exec -it sciol-xyzen-{{ service }}-1 {{ cmd }}

# =============================================================================
# Git & Maintenance
# =============================================================================

# Clean stale local branches (interactive)
clean-branches:
    ./launch/clean.sh

# Run pre-commit on all files
pre-commit:
    pre-commit run --all-files

# Run pre-commit on staged files only
pre-commit-staged:
    pre-commit run

# =============================================================================
# Build & Release
# =============================================================================

# Build development images
build-dev:
    ./launch/buildx-dev.sh

# Build production images
build-prod:
    ./launch/buildx-prod.sh
