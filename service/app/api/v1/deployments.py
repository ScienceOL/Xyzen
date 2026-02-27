"""REST API endpoints for managing Settler deployments."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.deployment import DeploymentRead
from app.repos.deployment import DeploymentRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["deployments"])


def _require_settler_enabled() -> None:
    if not configs.Settler.Enable:
        raise HTTPException(status_code=404, detail="Settler deployment service is not enabled")


@router.get("/", response_model=list[DeploymentRead])
async def list_deployments(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DeploymentRead]:
    """List all deployments for the current user."""
    _require_settler_enabled()
    repo = DeploymentRepository(db)
    deployments = await repo.list_by_user(user)
    return [DeploymentRead.model_validate(d) for d in deployments]


@router.get("/{deployment_id}", response_model=DeploymentRead)
async def get_deployment(
    deployment_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DeploymentRead:
    """Get deployment details."""
    _require_settler_enabled()
    repo = DeploymentRepository(db)
    deployment = await repo.get_by_id(deployment_id, user_id=user)
    if deployment is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return DeploymentRead.model_validate(deployment)


@router.delete("/{deployment_id}", status_code=204)
async def delete_deployment(
    deployment_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Undeploy: stop workspace and mark as deleted."""
    _require_settler_enabled()
    repo = DeploymentRepository(db)
    deployment = await repo.get_by_id(deployment_id, user_id=user)
    if deployment is None:
        raise HTTPException(status_code=404, detail="Deployment not found")

    from app.infra.settler.daytona_provider import DaytonaSettlerProvider

    provider = DaytonaSettlerProvider()
    try:
        await provider.delete_workspace(deployment.sandbox_id)
    except Exception:
        logger.warning("Failed to delete workspace %s", deployment.sandbox_id, exc_info=True)

    await repo.update_status(deployment_id, "deleted")
    await db.commit()


@router.post("/{deployment_id}/stop", response_model=DeploymentRead)
async def stop_deployment(
    deployment_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DeploymentRead:
    """Stop a running deployment."""
    _require_settler_enabled()
    repo = DeploymentRepository(db)
    deployment = await repo.get_by_id(deployment_id, user_id=user)
    if deployment is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if deployment.status != "running":
        raise HTTPException(status_code=400, detail=f"Cannot stop deployment in '{deployment.status}' state")

    from app.infra.settler.daytona_provider import DaytonaSettlerProvider

    provider = DaytonaSettlerProvider()
    await provider.stop(deployment.sandbox_id)

    updated = await repo.update_status(deployment_id, "stopped")
    await db.commit()
    if updated:
        await db.refresh(updated)
        return DeploymentRead.model_validate(updated)
    raise HTTPException(status_code=500, detail="Failed to update deployment status")


@router.post("/{deployment_id}/start", response_model=DeploymentRead)
async def start_deployment(
    deployment_id: UUID,
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> DeploymentRead:
    """Restart a stopped deployment."""
    _require_settler_enabled()
    repo = DeploymentRepository(db)
    deployment = await repo.get_by_id(deployment_id, user_id=user)
    if deployment is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if deployment.status != "stopped":
        raise HTTPException(status_code=400, detail=f"Cannot start deployment in '{deployment.status}' state")

    from app.infra.settler.daytona_provider import DaytonaSettlerProvider

    provider = DaytonaSettlerProvider()
    await provider.start(deployment.sandbox_id)

    # Re-run the start command
    import shlex

    await provider.exec(
        deployment.sandbox_id,
        f"cd /workspace && nohup sh -c {shlex.quote(deployment.start_command)} > /tmp/settler.log 2>&1 &",
    )

    updated = await repo.update_status(deployment_id, "running")
    await db.commit()
    if updated:
        await db.refresh(updated)
        return DeploymentRead.model_validate(updated)
    raise HTTPException(status_code=500, detail="Failed to update deployment status")
