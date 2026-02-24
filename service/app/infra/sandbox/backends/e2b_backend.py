"""
E2B sandbox backend implementation.

Uses the E2B Python SDK to manage cloud sandboxes.
Docs: https://e2b.dev/docs
"""

from __future__ import annotations

import logging
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
    """Sandbox backend using E2B cloud sandboxes."""

    def _api_key(self) -> str:
        key = configs.Sandbox.E2B.ApiKey
        if not key:
            raise RuntimeError("E2B API key is not configured (XYZEN_SANDBOX_E2B_ApiKey)")
        return key

    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
        config: ResolvedSandboxConfig | None = None,
    ) -> str:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        e2b_cfg = configs.Sandbox.E2B
        timeout = config.timeout if config else e2b_cfg.TimeoutSeconds
        sandbox = await AsyncSandbox.create(
            template=e2b_cfg.Template,
            api_key=self._api_key(),
            timeout=timeout,
            metadata={"xyzen_sandbox": name},
            envs=env_vars or {},
        )
        logger.info(f"Created E2B sandbox: {sandbox.sandbox_id} (label={name})")
        return sandbox.sandbox_id

    async def delete_sandbox(self, sandbox_id: str) -> None:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        await sandbox.kill()
        logger.info(f"Deleted E2B sandbox: {sandbox_id}")

    async def exec(
        self,
        sandbox_id: str,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
    ) -> ExecResult:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        effective_timeout = timeout or configs.Sandbox.Timeout
        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())

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
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        return await sandbox.files.read(path, format="bytes")

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        # Ensure parent directory exists
        parent = "/".join(path.rsplit("/", 1)[:-1])
        if parent:
            await sandbox.commands.run(f"mkdir -p {parent}")
        await sandbox.files.write(path, content)

    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
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
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        parent = "/".join(path.rsplit("/", 1)[:-1])
        if parent:
            await sandbox.commands.run(f"mkdir -p {parent}")
        await sandbox.files.write(path, data)

    async def get_preview_url(self, sandbox_id: str, port: int) -> PreviewUrl:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        url = sandbox.get_host(port)
        return PreviewUrl(url=f"https://{url}", token="", port=port)

    # --- Lifecycle methods ---

    async def get_status(self, sandbox_id: str) -> SandboxState:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        try:
            sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
            running = sandbox.is_running()
            return SandboxState(
                status=SandboxStatus.running if running else SandboxStatus.stopped,
            )
        except Exception:
            return SandboxState(status=SandboxStatus.unknown)

    async def keep_alive(self, sandbox_id: str) -> None:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        e2b_cfg = configs.Sandbox.E2B
        sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
        await sandbox.set_timeout(e2b_cfg.TimeoutSeconds)
        logger.debug(f"Extended timeout for E2B sandbox {sandbox_id} to {e2b_cfg.TimeoutSeconds}s")

    async def get_info(self, sandbox_id: str) -> dict[str, Any]:
        from e2b_code_interpreter import AsyncSandbox  # type: ignore[import-not-found]

        try:
            sandbox = await AsyncSandbox.connect(sandbox_id, api_key=self._api_key())
            return {
                "sandbox_id": sandbox.sandbox_id,
                "is_running": sandbox.is_running(),
                "template": configs.Sandbox.E2B.Template,
            }
        except Exception:
            return {"sandbox_id": sandbox_id, "is_running": False}


__all__ = ["E2BBackend"]
