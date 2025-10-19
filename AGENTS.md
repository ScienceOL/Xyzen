# Repository Guidelines

## Project Structure & Module Organization
- Backend lives in `service/`: domain logic under `service/core/`, HTTP routers in `service/handler/`, middleware in `service/middleware/`, and migrations in `service/migrations/`.
- Frontend resides in `web/` with React source in `web/src/`; colocate hooks, components, and styles per feature.
- Infrastructure helpers sit in `docker/`, `infra/`, and `launch/` for container orchestration, SSO, and MQTT integration.
- Mirror backend tests in `service/tests/` (e.g., `service/tests/handler/test_session.py`) to match package layout.

## Build, Test, and Development Commands
- `make dev` spins up the full stack via Docker Compose; pass `ARGS="-d"` to detach.
- `cd service && uv run uvicorn cmd.main:app --reload` starts the FastAPI server for backend-only edits.
- `cd service && uv run alembic upgrade head` applies schema migrations; follow with downgrade testing when relevant.
- `cd web && yarn dev --host --port 32233` previews the React UI; use `yarn build` for production bundles and `yarn lint` before commits.

## Coding Style & Naming Conventions
- Python follows `black` (119-column limit) and `isort`; run `uv run pre-commit run --all-files` before review.
- Name Python modules in snake_case and routers after resources (e.g., `handler/session_router.py`).
- React components use PascalCase, hooks camelCase, and files stay close to their usage; ESLint + Prettier enforce formatting.
- Keep environment keys uppercase with the `XYZEN_` prefix, mirroring entries in `service/internal/configs`.

## Testing Guidelines
- Backend tests use `pytest`; run `cd service && uv run pytest`.
- Confirm migrations by running an upgrade/rollback cycle.
- Frontend tests rely on Vitest/React Testing Library under `web/src/__tests__/`; document manual QA scenarios when automation is impractical.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`fix: adjust websocket host`, `chore: bump vite`) with imperative subjects ≤72 characters.
- PRs should summarize changes, link the relevant issue or task, include proof of testing, and attach UI captures when the web client changes.
- Ensure CI-critical checks (`pytest`, `yarn lint`, `pre-commit`) pass locally before requesting review.

## Security & Configuration Tips
- Never commit populated `.env` files; copy `docker/.env.example` to `docker/.env.dev` and update secrets locally.
- Record any new `XYZEN_` configuration variables in code comments or infra notes so operators can provision them confidently.
