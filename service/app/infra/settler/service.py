"""Settler service — orchestrates persistent deployments.

Transfers files from an ephemeral sandbox to a dedicated long-running
Daytona workspace and starts the service there.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.configs import configs
from app.infra.database import get_task_db_session
from app.models.deployment import Deployment, DeploymentCreate
from app.repos.deployment import DeploymentRepository

if TYPE_CHECKING:
    from app.infra.sandbox.manager import SandboxManager
    from app.infra.settler.daytona_provider import DaytonaSettlerProvider

logger = logging.getLogger(__name__)


class SettlerService:
    """Core orchestration for the Settler deployment layer."""

    def __init__(self, provider: DaytonaSettlerProvider) -> None:
        self._provider = provider

    async def deploy(
        self,
        *,
        session_id: str,
        user_id: str,
        source_sandbox_manager: SandboxManager,
        port: int,
        start_command: str,
        source_dir: str,
    ) -> Deployment:
        """Deploy a service from sandbox to a persistent workspace.

        1. Validate limits
        2. Tar source_dir in sandbox
        3. Create deployment workspace
        4. Transfer + extract
        5. Start service
        6. Record in DB
        """
        if not configs.Settler.Enable:
            raise RuntimeError("Settler service is disabled")

        # Check deployment limit
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            active_count = await repo.count_active_by_user(user_id)
            if active_count >= configs.Settler.MaxPerUser:
                raise ValueError(
                    f"Maximum concurrent deployments reached ({configs.Settler.MaxPerUser}). "
                    "Please stop or delete an existing deployment first."
                )

        # Tar source directory in sandbox
        tar_path = "/tmp/settler_deploy.tar.gz"
        tar_result = await source_sandbox_manager.exec(
            f"tar -czf {tar_path} -C {source_dir} .",
            timeout=60,
        )
        if tar_result.exit_code != 0:
            raise RuntimeError(f"Failed to tar source directory: {tar_result.stderr or tar_result.stdout}")

        # Download tar from sandbox
        tar_bytes = await source_sandbox_manager.read_file_bytes(tar_path)

        # Create deployment workspace
        label = f"deploy-{session_id[:8]}-{port}"
        workspace_id = await self._provider.create_workspace(label)

        deployment: Deployment | None = None
        try:
            # Create DB record (status=creating)
            async with get_task_db_session() as db:
                repo = DeploymentRepository(db)
                deployment = await repo.create(
                    DeploymentCreate(
                        user_id=user_id,
                        session_id=session_id,
                        sandbox_id=workspace_id,
                        port=port,
                        start_command=start_command,
                        source_dir=source_dir,
                    )
                )
                await db.commit()
                await db.refresh(deployment)

            # Upload tar to deployment workspace and extract
            await self._provider.upload_bytes(workspace_id, "/tmp/deploy.tar.gz", tar_bytes)
            extract_result = await self._provider.exec(
                workspace_id,
                "mkdir -p /workspace && tar -xzf /tmp/deploy.tar.gz -C /workspace && rm /tmp/deploy.tar.gz",
            )
            if extract_result.exit_code != 0:
                raise RuntimeError(f"Failed to extract files: {extract_result.stderr or extract_result.stdout}")

            # Start the service (detached)
            start_result = await self._provider.exec(
                workspace_id,
                f"cd /workspace && nohup sh -c {_shell_quote(start_command)} > /tmp/settler.log 2>&1 &",
            )
            if start_result.exit_code != 0:
                raise RuntimeError(f"Failed to start service: {start_result.stderr or start_result.stdout}")

            # Get persistent URL
            url = await self._provider.get_preview_url(workspace_id, port)

            # Update DB record
            async with get_task_db_session() as db:
                repo = DeploymentRepository(db)
                deployment = await repo.update_status(deployment.id, "running", url=url)
                await db.commit()
                if deployment:
                    await db.refresh(deployment)

            if deployment is None:
                raise RuntimeError("Failed to update deployment status")

            logger.info("Deployed %s → %s", deployment.id, url)
            return deployment

        except Exception:
            # Cleanup on failure
            if deployment is not None:
                try:
                    async with get_task_db_session() as db:
                        repo = DeploymentRepository(db)
                        await repo.update_status(deployment.id, "failed")
                        await db.commit()
                except Exception:
                    logger.warning("Failed to mark deployment as failed", exc_info=True)
            try:
                await self._provider.delete_workspace(workspace_id)
            except Exception:
                logger.warning("Failed to cleanup deployment workspace %s", workspace_id, exc_info=True)
            raise

    async def undeploy(self, deployment_id: str, user_id: str) -> Deployment:
        """Stop and delete a deployment."""
        from uuid import UUID

        did = UUID(deployment_id)
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            deployment = await repo.get_by_id(did, user_id=user_id)
            if deployment is None:
                raise ValueError("Deployment not found")

            # Stop and delete workspace
            try:
                await self._provider.delete_workspace(deployment.sandbox_id)
            except Exception:
                logger.warning("Failed to delete workspace %s", deployment.sandbox_id, exc_info=True)

            deployment = await repo.update_status(did, "deleted")
            await db.commit()
            if deployment:
                await db.refresh(deployment)

        if deployment is None:
            raise RuntimeError("Failed to update deployment status")
        return deployment

    async def stop_deployment(self, deployment_id: str, user_id: str) -> Deployment:
        """Stop a running deployment without deleting it."""
        from uuid import UUID

        did = UUID(deployment_id)
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            deployment = await repo.get_by_id(did, user_id=user_id)
            if deployment is None:
                raise ValueError("Deployment not found")
            if deployment.status != "running":
                raise ValueError(f"Cannot stop deployment in '{deployment.status}' state")

            await self._provider.stop(deployment.sandbox_id)
            deployment = await repo.update_status(did, "stopped")
            await db.commit()
            if deployment:
                await db.refresh(deployment)

        if deployment is None:
            raise RuntimeError("Failed to update deployment status")
        return deployment

    async def start_deployment(self, deployment_id: str, user_id: str) -> Deployment:
        """Restart a stopped deployment."""
        from uuid import UUID

        did = UUID(deployment_id)
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            deployment = await repo.get_by_id(did, user_id=user_id)
            if deployment is None:
                raise ValueError("Deployment not found")
            if deployment.status != "stopped":
                raise ValueError(f"Cannot start deployment in '{deployment.status}' state")

            await self._provider.start(deployment.sandbox_id)

            # Re-run the start command
            await self._provider.exec(
                deployment.sandbox_id,
                f"cd /workspace && nohup sh -c {_shell_quote(deployment.start_command)} > /tmp/settler.log 2>&1 &",
            )

            deployment = await repo.update_status(did, "running")
            await db.commit()
            if deployment:
                await db.refresh(deployment)

        if deployment is None:
            raise RuntimeError("Failed to update deployment status")
        return deployment

    async def list_deployments(self, user_id: str) -> list[Deployment]:
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            return await repo.list_by_user(user_id)

    async def get_deployment(self, deployment_id: str, user_id: str) -> Deployment | None:
        from uuid import UUID

        did = UUID(deployment_id)
        async with get_task_db_session() as db:
            repo = DeploymentRepository(db)
            return await repo.get_by_id(did, user_id=user_id)


def _shell_quote(s: str) -> str:
    """Quote a string for use in sh -c '...'."""
    import shlex

    return shlex.quote(s)
