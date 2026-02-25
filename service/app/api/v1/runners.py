import hashlib
import logging
import secrets
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.runner import Runner, RunnerRead, RunnerUpdate
from app.repos.runner import RunnerRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["runners"])

# --- CLI version metadata ---------------------------------------------------
CLI_LATEST_VERSION = "0.1.0"
CLI_DOWNLOAD_BASE = "https://xyzen.ai/releases/cli"

RUNNER_ONLINE_PREFIX = "runner:online:"


class CreateRunnerTokenRequest(BaseModel):
    name: str = Field(max_length=255, description="Human-readable runner name")


class CreateRunnerTokenResponse(BaseModel):
    runner: RunnerRead
    token: str = Field(description="Plaintext token — shown only once")
    connect_command: str = Field(description="CLI command to connect this runner")


class UpdateRunnerRequest(BaseModel):
    name: str | None = None
    is_active: bool | None = None


async def _enrich_online_status(runners: list[Runner]) -> list[RunnerRead]:
    """Enrich Runner models with live online status from Redis."""
    if not runners:
        return []

    r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
    try:
        pipe = r.pipeline()
        for runner in runners:
            pipe.exists(f"{RUNNER_ONLINE_PREFIX}{runner.user_id}")
        results = await pipe.execute()

        enriched: list[RunnerRead] = []
        for runner, is_online in zip(runners, results):
            read = RunnerRead.model_validate(runner)
            read.is_online = bool(is_online)
            enriched.append(read)
        return enriched
    finally:
        await r.aclose()


@router.post("/token", response_model=CreateRunnerTokenResponse, status_code=201)
async def create_runner_token(
    req: CreateRunnerTokenRequest,
    request: Request,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> CreateRunnerTokenResponse:
    """Generate a new runner token. The plaintext token is returned only once."""
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:8]

    runner = Runner(
        name=req.name,
        user_id=user,
        token_hash=token_hash,
        token_prefix=token_prefix,
    )

    repo = RunnerRepository(db)
    runner = await repo.create(runner)
    await db.commit()

    runner_read = RunnerRead.model_validate(runner)

    # Build connect command with the actual host from the request
    host = request.headers.get("host", "")
    scheme = "wss" if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" else "ws"
    connect_cmd = f"xyzen connect --token {token} --url {scheme}://{host}/xyzen/ws/v1/runner"

    return CreateRunnerTokenResponse(
        runner=runner_read,
        token=token,
        connect_command=connect_cmd,
    )


@router.get("/", response_model=list[RunnerRead])
async def list_runners(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[RunnerRead]:
    """List all runners for the current user with online status."""
    repo = RunnerRepository(db)
    runners = await repo.list_by_user(user)
    return await _enrich_online_status(runners)


@router.patch("/{runner_id}", response_model=RunnerRead)
async def update_runner(
    runner_id: UUID,
    req: UpdateRunnerRequest,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> RunnerRead:
    """Update a runner's name or active status."""
    repo = RunnerRepository(db)
    runner = await repo.get_by_id(runner_id)
    if not runner or runner.user_id != user:
        raise HTTPException(status_code=404, detail="Runner not found")

    update = RunnerUpdate()
    if req.name is not None:
        update.name = req.name
    if req.is_active is not None:
        update.is_active = req.is_active

    updated = await repo.update(runner_id, update)
    await db.commit()

    if not updated:
        raise HTTPException(status_code=404, detail="Runner not found")

    # Enrich with online status
    enriched = await _enrich_online_status([updated])
    return enriched[0]


@router.delete("/{runner_id}", status_code=204)
async def delete_runner(
    runner_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Delete a runner and revoke its token."""
    repo = RunnerRepository(db)
    runner = await repo.get_by_id(runner_id)
    if not runner or runner.user_id != user:
        raise HTTPException(status_code=404, detail="Runner not found")

    await repo.delete(runner_id)
    await db.commit()


# --- Public CLI version endpoint (no auth) ----------------------------------

_PLATFORMS = {
    "darwin-amd64": "macOS (Intel)",
    "darwin-arm64": "macOS (Apple Silicon)",
    "linux-amd64": "Linux (x86_64)",
    "linux-arm64": "Linux (ARM64)",
    "windows-amd64": "Windows (x86_64)",
}


class CLIVersionResponse(BaseModel):
    version: str
    download: dict[str, str] = Field(description="platform → download URL")
    install_command: str = Field(description="One-liner install for current platform")


@router.get("/cli/latest", response_model=CLIVersionResponse)
async def get_cli_latest_version() -> CLIVersionResponse:
    """Return the latest CLI version and per-platform download URLs (public, no auth)."""
    download = {}
    for plat, _label in _PLATFORMS.items():
        suffix = ".exe" if plat.startswith("windows") else ""
        download[plat] = f"{CLI_DOWNLOAD_BASE}/v{CLI_LATEST_VERSION}/xyzen-{plat}{suffix}"

    install_command = (
        f"curl -fsSL {CLI_DOWNLOAD_BASE}/v{CLI_LATEST_VERSION}/xyzen-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/') "
        f"-o /usr/local/bin/xyzen && chmod +x /usr/local/bin/xyzen"
    )

    return CLIVersionResponse(
        version=CLI_LATEST_VERSION,
        download=download,
        install_command=install_command,
    )
