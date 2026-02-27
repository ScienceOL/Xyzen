"""Daytona-based provider for Settler deployment workspaces.

Thin wrapper around the Daytona SDK for creating and managing
long-running deployment workspaces (auto_stop=0).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from daytona import (
    AsyncDaytona,
    CreateSandboxFromImageParams,
    DaytonaConfig,
    Resources,
)

from app.configs import configs

logger = logging.getLogger(__name__)


@dataclass
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str


class DaytonaSettlerProvider:
    """Manages Daytona workspaces for persistent deployments."""

    def _get_config(self) -> DaytonaConfig:
        sc = configs.Settler
        return DaytonaConfig(
            api_url=sc.ApiUrl,
            api_key=sc.ApiKey or None,
            target=sc.Target,
        )

    def _client(self) -> AsyncDaytona:
        return AsyncDaytona(self._get_config())

    async def create_workspace(self, label: str) -> str:
        """Create a deployment workspace with auto_stop=0 (never stops)."""
        sc = configs.Settler
        async with self._client() as daytona:
            params = CreateSandboxFromImageParams(
                image=sc.Image,
                labels={"xyzen_deployment": label},
                auto_stop_interval=0,
                auto_delete_interval=sc.AutoDeleteMinutes,
                resources=Resources(
                    cpu=sc.Cpu,
                    memory=sc.Memory,
                    disk=sc.Disk,
                ),
            )
            sandbox = await daytona.create(params, timeout=150)
            logger.info("Created deployment workspace: %s (label=%s)", sandbox.id, label)
            return sandbox.id

    async def delete_workspace(self, workspace_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            await daytona.delete(sandbox)
            logger.info("Deleted deployment workspace: %s", workspace_id)

    async def exec(self, workspace_id: str, command: str, timeout: int = 120) -> ExecResult:
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            response = await sandbox.process.exec(command, timeout=timeout)
            exit_code = int(response.exit_code) if hasattr(response, "exit_code") else 0
            stdout = response.result if hasattr(response, "result") else str(response)
            return ExecResult(exit_code=exit_code, stdout=stdout, stderr="")

    async def upload_bytes(self, workspace_id: str, path: str, data: bytes) -> None:
        import shlex

        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            parent = "/".join(path.rsplit("/", 1)[:-1])
            if parent:
                await sandbox.process.exec(f"mkdir -p {shlex.quote(parent)}")
            await sandbox.fs.upload_file(data, path)

    async def download_bytes(self, workspace_id: str, path: str) -> bytes:
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            return await sandbox.fs.download_file(path)

    async def get_preview_url(self, workspace_id: str, port: int) -> str:
        sc = configs.Settler
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            signed = await sandbox.create_signed_preview_url(port, expires_in_seconds=0)
        token = signed.token or ""
        return f"{sc.ProxyProtocol}://{port}-{token}.{sc.ProxyBaseUrl}"

    async def stop(self, workspace_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            await sandbox.stop()
            logger.info("Stopped deployment workspace: %s", workspace_id)

    async def start(self, workspace_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(workspace_id)
            await sandbox.start(timeout=120)
            logger.info("Started deployment workspace: %s", workspace_id)
