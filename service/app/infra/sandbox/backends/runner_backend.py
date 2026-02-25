"""
Runner sandbox backend.

Routes sandbox operations over WebSocket to a connected Runner CLI
instead of executing in a cloud sandbox (Daytona/E2B).
"""

from __future__ import annotations

import base64
import logging
import uuid
from typing import Any

from app.infra.sandbox.backends.base import (
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


class RunnerBackend(SandboxBackend):
    """SandboxBackend that routes operations to a connected Runner via WebSocket."""

    def __init__(self, user_id: str) -> None:
        self._user_id = user_id

    async def _send_request(self, request_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Send a typed request to the runner and return the response payload."""
        from app.api.ws.v1.runner import send_runner_request

        request_id = f"req_{uuid.uuid4().hex[:12]}"
        response = await send_runner_request(
            user_id=self._user_id,
            request_type=request_type,
            payload=payload,
            request_id=request_id,
        )

        if not response.get("success", False):
            error = response.get("payload", {}).get("error", "Runner request failed")
            raise RuntimeError(f"Runner error: {error}")

        return response.get("payload", {})

    # --- SandboxBackend interface ---

    async def create_sandbox(
        self,
        name: str,
        language: str = "python",
        env_vars: dict[str, str] | None = None,
        config: ResolvedSandboxConfig | None = None,
    ) -> str:
        # No-op: the runner IS the sandbox
        return f"runner:{self._user_id}"

    async def delete_sandbox(self, sandbox_id: str) -> None:
        # No-op
        pass

    async def exec(
        self,
        sandbox_id: str,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
    ) -> ExecResult:
        payload: dict[str, str | int | None] = {"command": command}
        if cwd:
            payload["cwd"] = cwd
        if timeout:
            payload["timeout"] = timeout

        result = await self._send_request("exec", payload)
        return ExecResult(
            exit_code=result.get("exit_code", -1),
            stdout=result.get("stdout", ""),
            stderr=result.get("stderr", ""),
        )

    async def read_file(self, sandbox_id: str, path: str) -> str:
        result = await self._send_request("read_file", {"path": path})
        return result.get("content", "")

    async def read_file_bytes(self, sandbox_id: str, path: str) -> bytes:
        result = await self._send_request("read_file_bytes", {"path": path})
        return base64.b64decode(result.get("data", ""))

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        await self._send_request("write_file", {"path": path, "content": content})

    async def write_file_bytes(self, sandbox_id: str, path: str, data: bytes) -> None:
        await self._send_request(
            "write_file_bytes",
            {
                "path": path,
                "data": base64.b64encode(data).decode(),
            },
        )

    async def list_files(self, sandbox_id: str, path: str) -> list[FileInfo]:
        result = await self._send_request("list_files", {"path": path})
        return [
            FileInfo(
                name=f.get("name", ""),
                path=f.get("path", ""),
                is_dir=f.get("is_dir", False),
                size=f.get("size"),
            )
            for f in result.get("files", [])
        ]

    async def find_files(self, sandbox_id: str, root: str, pattern: str) -> list[str]:
        result = await self._send_request("find_files", {"root": root, "pattern": pattern})
        return result.get("files", [])

    async def search_in_files(
        self,
        sandbox_id: str,
        root: str,
        pattern: str,
        include: str | None = None,
    ) -> list[SearchMatch]:
        payload: dict[str, str | None] = {"root": root, "pattern": pattern}
        if include:
            payload["include"] = include
        result = await self._send_request("search_in_files", payload)
        return [
            SearchMatch(
                file=m.get("file", ""),
                line=m.get("line", 0),
                content=m.get("content", ""),
            )
            for m in result.get("matches", [])
        ]

    async def get_preview_url(self, sandbox_id: str, port: int) -> PreviewUrl:
        raise NotImplementedError("Preview URLs are not supported for local runners")

    async def get_status(self, sandbox_id: str) -> SandboxState:
        import redis.asyncio as aioredis

        from app.configs import configs

        r = aioredis.from_url(configs.Redis.REDIS_URL, decode_responses=True)
        try:
            online = await r.exists(f"runner:online:{self._user_id}")
            return SandboxState(
                status=SandboxStatus.running if online else SandboxStatus.stopped,
            )
        finally:
            await r.aclose()
