"""
E2B sandbox backend implementation.

Uses the E2B Python SDK to manage cloud sandboxes.
Supports ``auto_pause`` for persistent sandbox state (filesystem + memory)
across idle periods.

Docs: https://e2b.dev/docs
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

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


class E2BBackend(SandboxBackend):
    """Sandbox backend using E2B cloud sandboxes.

    When ``E2B.AutoPause`` is enabled (default), sandboxes are created with
    ``beta_create(auto_pause=True)`` so they are *paused* rather than
    *killed* on timeout.  All data-plane operations (``exec``, ``read_file``,
    etc.) use ``AsyncSandbox.connect()`` which transparently resumes a
    paused sandbox (~1 s).
    """

    def _api_key(self) -> str:
        key = configs.Sandbox.E2B.ApiKey
        if not key:
            raise RuntimeError("E2B API key is not configured (XYZEN_SANDBOX_E2B_ApiKey)")
        return key

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _api_params(self) -> dict[str, Any]:
        """Common kwargs forwarded to E2B static / class methods."""
        return {"api_key": self._api_key()}

    async def _connect(self, sandbox_id: str) -> Any:
        """Connect to a sandbox (auto-resumes if paused)."""
        from e2b_code_interpreter import AsyncSandbox

        return await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
        config: ResolvedSandboxConfig | None = None,
    ) -> str:
        from e2b_code_interpreter import AsyncSandbox

        e2b_cfg = configs.Sandbox.E2B
        timeout = config.timeout if config else e2b_cfg.TimeoutSeconds

        if e2b_cfg.AutoPause:
            sandbox = await AsyncSandbox.beta_create(
                template=e2b_cfg.Template,
                api_key=self._api_key(),
                timeout=timeout,
                auto_pause=True,
                metadata={"xyzen_sandbox": name},
                envs=env_vars or {},
            )
        else:
            sandbox = await AsyncSandbox.create(
                template=e2b_cfg.Template,
                api_key=self._api_key(),
                timeout=timeout,
                metadata={"xyzen_sandbox": name},
                envs=env_vars or {},
            )

        # E2B base template uses /home/user — create the configured workdir
        work_dir = configs.Sandbox.WorkDir
        if work_dir:
            await sandbox.commands.run(f"mkdir -p {work_dir} && chown user:user {work_dir}", user="root")

        logger.info(f"Created E2B sandbox: {sandbox.sandbox_id} (auto_pause={e2b_cfg.AutoPause})")
        return sandbox.sandbox_id

    async def delete_sandbox(self, sandbox_id: str) -> None:
        from e2b_code_interpreter import AsyncSandbox

        # Static kill — works for both running and paused sandboxes,
        # returns False (instead of raising) when the sandbox is already gone.
        await AsyncSandbox.kill(sandbox_id, **self._api_params())
        logger.info(f"Deleted E2B sandbox: {sandbox_id}")

    async def exec(
        self,
        sandbox_id: str,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
    ) -> ExecResult:
        effective_timeout = timeout or configs.Sandbox.Timeout
        sandbox = await self._connect(sandbox_id)

        full_command = command
        if cwd:
            full_command = f"cd {cwd} && {command}"

        result = await sandbox.commands.run(full_command, timeout=effective_timeout)

        return ExecResult(
            exit_code=result.exit_code,
            stdout=result.stdout,
            stderr=result.stderr,
        )

    async def read_file(self, sandbox_id: str, path: str) -> str:
        content_bytes = await self.read_file_bytes(sandbox_id, path)
        return content_bytes.decode("utf-8")

    async def read_file_bytes(self, sandbox_id: str, path: str) -> bytes:
        sandbox = await self._connect(sandbox_id)
        data = await sandbox.files.read(path, format="bytes")
        # E2B SDK returns bytearray — normalise to bytes for downstream consumers
        return bytes(data) if not isinstance(data, bytes) else data

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        sandbox = await self._connect(sandbox_id)
        parent = "/".join(path.rsplit("/", 1)[:-1])
        if parent:
            await sandbox.commands.run(f"mkdir -p {parent}")
        await sandbox.files.write(path, content)

    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        sandbox = await self._connect(sandbox_id)
        entries = await sandbox.files.list(path)
        return [
            FileInfo(
                name=entry.name,
                path=f"{path}/{entry.name}",
                is_dir=entry.type == "dir",
            )
            for entry in entries
        ]

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
        sandbox = await self._connect(sandbox_id)
        parent = "/".join(path.rsplit("/", 1)[:-1])
        if parent:
            await sandbox.commands.run(f"mkdir -p {parent}")
        await sandbox.files.write(path, data)

    async def get_preview_url(self, sandbox_id: str, port: int) -> PreviewUrl:
        sandbox = await self._connect(sandbox_id)
        url = sandbox.get_host(port)
        return PreviewUrl(url=f"https://{url}", token="", port=port)

    # ------------------------------------------------------------------
    # Lifecycle methods
    # ------------------------------------------------------------------

    async def get_status(self, sandbox_id: str) -> SandboxState:
        """Query E2B API for sandbox state *without* triggering auto-resume.

        Uses the static ``get_info`` endpoint (HTTP GET) which returns
        metadata including ``state`` (``running`` / ``paused``).
        If the sandbox no longer exists the API returns 404.
        """
        from e2b_code_interpreter import AsyncSandbox

        try:
            info = await AsyncSandbox.get_info(sandbox_id, **self._api_params())
        except Exception:
            # Sandbox not found — already killed or expired.
            return SandboxState(status=SandboxStatus.stopped)

        from e2b.api.client.models.sandbox_state import SandboxState as E2BSandboxState

        if info.state == E2BSandboxState.RUNNING:
            remaining = self._remaining_seconds(info)
            return SandboxState(status=SandboxStatus.running, remaining_seconds=remaining)

        if info.state == E2BSandboxState.PAUSED:
            return SandboxState(
                status=SandboxStatus.stopped,
                metadata={"paused": True},
            )

        return SandboxState(status=SandboxStatus.unknown)

    async def keep_alive(self, sandbox_id: str) -> None:
        """Extend the sandbox timeout.

        For running sandboxes this resets the idle timer.  For paused
        sandboxes this is a no-op (the pause retention is handled by
        E2B's ``PauseDurationDays`` and doesn't need refreshing).
        """
        from e2b_code_interpreter import AsyncSandbox

        e2b_cfg = configs.Sandbox.E2B
        try:
            await AsyncSandbox.set_timeout(sandbox_id, e2b_cfg.TimeoutSeconds, **self._api_params())
        except Exception as e:
            # set_timeout fails on paused sandboxes — that's fine.
            logger.debug(f"keep_alive skipped for {sandbox_id} (likely paused): {e}")

    async def start(self, sandbox_id: str) -> None:
        """Resume a paused sandbox.

        ``AsyncSandbox.connect()`` transparently resumes paused
        sandboxes.  After resume we also reset the timeout so the
        sandbox stays alive for the configured duration.
        """
        e2b_cfg = configs.Sandbox.E2B
        sandbox = await self._connect(sandbox_id)
        await sandbox.set_timeout(e2b_cfg.TimeoutSeconds)
        logger.info(f"Resumed E2B sandbox {sandbox_id}")

    async def get_info(self, sandbox_id: str) -> dict[str, Any]:
        from e2b_code_interpreter import AsyncSandbox

        try:
            info = await AsyncSandbox.get_info(sandbox_id, **self._api_params())
            return {
                "sandbox_id": info.sandbox_id,
                "state": str(info.state),
                "template": info.template_id,
                "started_at": info.started_at.isoformat() if info.started_at else None,
                "end_at": info.end_at.isoformat() if info.end_at else None,
                "cpu_count": info.cpu_count,
                "memory_mb": info.memory_mb,
            }
        except Exception:
            return {"sandbox_id": sandbox_id, "state": "unknown"}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _remaining_seconds(info: Any) -> int | None:
        """Compute seconds until the sandbox times out from SandboxInfo.end_at."""
        try:
            end_at: datetime = info.end_at
            if end_at.tzinfo is None:
                end_at = end_at.replace(tzinfo=timezone.utc)
            remaining = (end_at - datetime.now(timezone.utc)).total_seconds()
            return max(0, int(remaining))
        except Exception:
            return None


__all__ = ["E2BBackend"]
