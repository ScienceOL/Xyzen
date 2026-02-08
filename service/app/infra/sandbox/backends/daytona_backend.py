"""
Daytona sandbox backend implementation.

Uses the Daytona Python SDK (AsyncDaytona) to manage sandboxes.
"""

from __future__ import annotations

import logging

from daytona import (
    AsyncDaytona,
    CodeLanguage,
    CreateSandboxFromImageParams,
    DaytonaConfig,
    Resources,
)

from app.configs import configs

from .base import ExecResult, FileInfo, SandboxBackend, SearchMatch

logger = logging.getLogger(__name__)


class DaytonaBackend(SandboxBackend):
    """Sandbox backend using self-hosted Daytona."""

    def _get_config(self) -> DaytonaConfig:
        """Build DaytonaConfig from app settings."""
        cfg = configs.Sandbox
        return DaytonaConfig(
            api_url=cfg.DaytonaApiUrl,
            api_key=cfg.DaytonaApiKey or None,
            target=cfg.DaytonaTarget,
        )

    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
    ) -> str:
        cfg = configs.Sandbox
        labels = {"xyzen_sandbox": name}

        # Map string to CodeLanguage enum
        lang_map: dict[str, CodeLanguage] = {
            "python": CodeLanguage.PYTHON,
            "javascript": CodeLanguage.JAVASCRIPT,
            "typescript": CodeLanguage.TYPESCRIPT,
        }
        code_language = lang_map.get(language, CodeLanguage.PYTHON)

        async with AsyncDaytona(self._get_config()) as daytona:
            params = CreateSandboxFromImageParams(
                image="python:3.12-slim",
                language=code_language,
                env_vars=env_vars,
                labels=labels,
                auto_stop_interval=cfg.AutoStopMinutes,
                resources=Resources(
                    cpu=cfg.Cpu,
                    memory=cfg.Memory,
                    disk=cfg.Disk,
                ),
            )
            sandbox = await daytona.create(params, timeout=150)
            logger.info(f"Created Daytona sandbox: {sandbox.id} (label={name})")
            return sandbox.id

    async def delete_sandbox(self, sandbox_id: str) -> None:
        async with AsyncDaytona(self._get_config()) as daytona:
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
        cfg = configs.Sandbox
        effective_timeout = timeout or cfg.Timeout

        # Wrap command with cd if cwd specified
        full_command = command
        if cwd:
            full_command = f"cd {cwd} && {command}"

        async with AsyncDaytona(self._get_config()) as daytona:
            sandbox = await daytona.get(sandbox_id)
            response = await sandbox.process.exec(full_command, timeout=effective_timeout)

            # Daytona SDK: response.exit_code (int) and response.result (str)
            exit_code = int(response.exit_code) if hasattr(response, "exit_code") else 0
            stdout = response.result if hasattr(response, "result") else str(response)

            return ExecResult(
                exit_code=exit_code,
                stdout=stdout,
                stderr="",
            )

    async def read_file(self, sandbox_id: str, path: str) -> str:
        async with AsyncDaytona(self._get_config()) as daytona:
            sandbox = await daytona.get(sandbox_id)
            content_bytes = await sandbox.fs.download_file(path)
            return content_bytes.decode("utf-8")

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        async with AsyncDaytona(self._get_config()) as daytona:
            sandbox = await daytona.get(sandbox_id)
            # Ensure parent directory exists
            parent = "/".join(path.rsplit("/", 1)[:-1])
            if parent:
                await sandbox.process.exec(f"mkdir -p {parent}")
            await sandbox.fs.upload_file(content.encode("utf-8"), path)

    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        async with AsyncDaytona(self._get_config()) as daytona:
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
        # Use exec with find command for complex glob support
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
        # Use grep via exec for reliable file content search
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
            # Parse grep output: file:line:content
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


__all__ = ["DaytonaBackend"]
