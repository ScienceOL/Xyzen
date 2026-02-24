"""
Daytona sandbox backend implementation.

Uses the Daytona Python SDK (AsyncDaytona) to manage sandboxes.
"""

from __future__ import annotations

import logging
from typing import Any

from daytona import (
    AsyncDaytona,
    CodeLanguage,
    CreateSandboxFromImageParams,
    DaytonaConfig,
    Resources,
)
from daytona import SandboxState as DaytonaSandboxState

from app.configs import configs

from .base import (
    ExecResult,
    FileInfo,
    PreviewUrl,
    ResolvedSandboxConfig,
    SandboxBackend,
    SandboxState,
    SandboxStatus,
    SearchMatch,
)

logger = logging.getLogger(__name__)


class DaytonaBackend(SandboxBackend):
    """Sandbox backend using self-hosted Daytona."""

    def _get_daytona_config(self) -> DaytonaConfig:
        """Build DaytonaConfig from nested app settings."""
        dc = configs.Sandbox.Daytona
        return DaytonaConfig(
            api_url=dc.ApiUrl,
            api_key=dc.ApiKey or None,
            target=dc.Target,
        )

    def _client(self) -> AsyncDaytona:
        """Create a Daytona async context-manager client."""
        return AsyncDaytona(self._get_daytona_config())

    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
        config: ResolvedSandboxConfig | None = None,
    ) -> str:
        # Use resolved per-user config when provided, otherwise fall back to globals
        if config:
            image = config.image
            cpu = config.cpu
            memory = config.memory
            disk = config.disk
            auto_stop = config.auto_stop_minutes
            auto_delete = config.auto_delete_minutes
        else:
            cfg = configs.Sandbox
            dc = cfg.Daytona
            image = dc.Image
            cpu = cfg.Cpu
            memory = cfg.Memory
            disk = cfg.Disk
            auto_stop = dc.AutoStopMinutes
            auto_delete = dc.AutoDeleteMinutes

        labels = {"xyzen_sandbox": name}

        lang_map: dict[str, CodeLanguage] = {
            "python": CodeLanguage.PYTHON,
            "javascript": CodeLanguage.JAVASCRIPT,
            "typescript": CodeLanguage.TYPESCRIPT,
        }
        code_language = lang_map.get(language, CodeLanguage.PYTHON)

        async with self._client() as daytona:
            params = CreateSandboxFromImageParams(
                image=image,
                language=code_language,
                env_vars=env_vars,
                labels=labels,
                auto_stop_interval=auto_stop,
                auto_delete_interval=auto_delete,
                resources=Resources(
                    cpu=cpu,
                    memory=memory,
                    disk=disk,
                ),
            )
            sandbox = await daytona.create(params, timeout=150)
            logger.info(f"Created Daytona sandbox: {sandbox.id} (label={name})")
            return sandbox.id

    async def delete_sandbox(self, sandbox_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            await daytona.delete(sandbox)
            logger.info(f"Deleted Daytona sandbox: {sandbox_id}")

    async def exec(
        self,
        sandbox_id: str,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
    ) -> ExecResult:
        effective_timeout = timeout or configs.Sandbox.Timeout

        full_command = command
        if cwd:
            full_command = f"cd {cwd} && {command}"

        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            response = await sandbox.process.exec(full_command, timeout=effective_timeout)

            exit_code = int(response.exit_code) if hasattr(response, "exit_code") else 0
            stdout = response.result if hasattr(response, "result") else str(response)

            return ExecResult(
                exit_code=exit_code,
                stdout=stdout,
                stderr="",
            )

    async def read_file(self, sandbox_id: str, path: str) -> str:
        content_bytes = await self.read_file_bytes(sandbox_id, path)
        return content_bytes.decode("utf-8")

    async def read_file_bytes(self, sandbox_id: str, path: str) -> bytes:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            return await sandbox.fs.download_file(path)

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            parent = "/".join(path.rsplit("/", 1)[:-1])
            if parent:
                await sandbox.process.exec(f"mkdir -p {parent}")
            await sandbox.fs.upload_file(content.encode("utf-8"), path)

    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            entries = await sandbox.fs.list_files(path)
            result: list[FileInfo] = []
            for entry in entries:
                entry_size = int(entry.size) if hasattr(entry, "size") else None
                result.append(
                    FileInfo(
                        name=entry.name if hasattr(entry, "name") else str(entry),
                        path=f"{path}/{entry.name}" if hasattr(entry, "name") else path,
                        is_dir=entry.is_dir if hasattr(entry, "is_dir") else False,
                        size=entry_size,
                    )
                )
            return result

    async def find_files(self, sandbox_id: str, root: str, pattern: str) -> list[str]:
        result = await self.exec(
            sandbox_id,
            f'find {root} -name "{pattern}" -type f 2>/dev/null | head -100',
        )
        if result.exit_code != 0 or not result.stdout.strip():
            return []
        return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]

    async def search_in_files(
        self,
        sandbox_id: str,
        root: str,
        pattern: str,
        include: str | None = None,
    ) -> list[SearchMatch]:
        include_flag = f'--include="{include}"' if include else ""
        result = await self.exec(
            sandbox_id,
            f'grep -rn {include_flag} "{pattern}" {root} 2>/dev/null | head -50',
        )
        if result.exit_code != 0 or not result.stdout.strip():
            return []

        matches: list[SearchMatch] = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split(":", 2)
            if len(parts) >= 3:
                try:
                    matches.append(
                        SearchMatch(
                            file=parts[0],
                            line=int(parts[1]),
                            content=parts[2],
                        )
                    )
                except ValueError:
                    continue
        return matches

    async def write_file_bytes(self, sandbox_id: str, path: str, data: bytes) -> None:
        import shlex

        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            parent = "/".join(path.rsplit("/", 1)[:-1])
            if parent:
                await sandbox.process.exec(f"mkdir -p {shlex.quote(parent)}")
            await sandbox.fs.upload_file(data, path)

    async def get_preview_url(self, sandbox_id: str, port: int) -> PreviewUrl:
        dc = configs.Sandbox.Daytona
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            signed = await sandbox.create_signed_preview_url(port, expires_in_seconds=3600)

        token = signed.token or ""
        url = f"{dc.ProxyProtocol}://{port}-{token}.{dc.ProxyBaseUrl}"

        return PreviewUrl(url=url, token=token, port=port)

    # --- Lifecycle methods ---

    _DAYTONA_STATE_MAP: dict[DaytonaSandboxState, SandboxStatus] = {
        DaytonaSandboxState.STARTED: SandboxStatus.running,
        DaytonaSandboxState.STARTING: SandboxStatus.running,
        DaytonaSandboxState.CREATING: SandboxStatus.running,
        DaytonaSandboxState.RESTORING: SandboxStatus.running,
        DaytonaSandboxState.STOPPED: SandboxStatus.stopped,
        DaytonaSandboxState.STOPPING: SandboxStatus.stopped,
        DaytonaSandboxState.DESTROYED: SandboxStatus.stopped,
        DaytonaSandboxState.DESTROYING: SandboxStatus.stopped,
        DaytonaSandboxState.ARCHIVED: SandboxStatus.stopped,
        DaytonaSandboxState.ERROR: SandboxStatus.stopped,
    }

    async def get_status(self, sandbox_id: str) -> SandboxState:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            await sandbox.refresh_data()

            status = self._DAYTONA_STATE_MAP.get(
                DaytonaSandboxState(sandbox.state) if sandbox.state else DaytonaSandboxState.UNKNOWN,
                SandboxStatus.unknown,
            )

            remaining: int | None = None
            if sandbox.auto_stop_interval and sandbox.updated_at:
                from datetime import datetime, timezone

                try:
                    updated = datetime.fromisoformat(sandbox.updated_at)
                    if updated.tzinfo is None:
                        updated = updated.replace(tzinfo=timezone.utc)
                    elapsed = (datetime.now(timezone.utc) - updated).total_seconds()
                    remaining = max(0, int(sandbox.auto_stop_interval * 60 - elapsed))
                except (ValueError, TypeError):
                    pass

            return SandboxState(status=status, remaining_seconds=remaining)

    async def keep_alive(self, sandbox_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            await sandbox.refresh_activity()
            logger.debug(f"Refreshed activity for Daytona sandbox {sandbox_id}")

    async def start(self, sandbox_id: str) -> None:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            await sandbox.start(timeout=120)
            logger.info(f"Started Daytona sandbox {sandbox_id}")

    async def get_info(self, sandbox_id: str) -> dict[str, Any]:
        async with self._client() as daytona:
            sandbox = await daytona.get(sandbox_id)
            await sandbox.refresh_data()
            return {
                "cpu": sandbox.cpu,
                "memory": sandbox.memory,
                "disk": sandbox.disk,
                "state": str(sandbox.state),
                "auto_stop_interval": sandbox.auto_stop_interval,
                "created_at": sandbox.created_at,
                "updated_at": sandbox.updated_at,
            }


__all__ = ["DaytonaBackend"]
