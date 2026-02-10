"""Unit tests for sandbox export tool operations."""

from __future__ import annotations

from typing import cast

import pytest

from app.infra.sandbox.manager import SandboxManager
from app.tools.builtin.sandbox import operations
from app.tools.builtin.sandbox.tools import create_sandbox_tools


class _DummyManager:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.read_paths: list[str] = []

    async def read_file_bytes(self, path: str) -> bytes:
        self.read_paths.append(path)
        return self.payload


def test_create_sandbox_tools_includes_export() -> None:
    tools = create_sandbox_tools()
    assert "sandbox_export" in tools


@pytest.mark.asyncio
async def test_sandbox_export_rejects_relative_path() -> None:
    manager = _DummyManager(payload=b"hello")

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="workspace/report.txt",
    )

    assert result["success"] is False
    assert "absolute" in result["error"]
    assert manager.read_paths == []


@pytest.mark.asyncio
async def test_sandbox_export_rejects_parent_segments() -> None:
    manager = _DummyManager(payload=b"hello")

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="/workspace/../etc/passwd",
    )

    assert result["success"] is False
    assert "invalid segments" in result["error"]
    assert manager.read_paths == []


@pytest.mark.asyncio
async def test_sandbox_export_requires_user_context() -> None:
    manager = _DummyManager(payload=b"hello")

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id=None,
        session_id="session-1",
        path="/workspace/out.txt",
    )

    assert result["success"] is False
    assert "requires user context" in result["error"]
    assert manager.read_paths == []


@pytest.mark.asyncio
async def test_sandbox_export_rejects_paths_outside_workspace() -> None:
    manager = _DummyManager(payload=b"hello")

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="/tmp/out.txt",
    )

    assert result["success"] is False
    assert "inside sandbox work directory" in result["error"]
    assert manager.read_paths == []


@pytest.mark.asyncio
async def test_sandbox_export_checks_max_size(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = _DummyManager(payload=b"abcd")
    monkeypatch.setattr(operations.configs.OSS, "MaxFileUploadBytes", 3)

    async def _fail_if_called(**_: object) -> dict[str, object]:
        raise AssertionError("_persist_exported_file should not be called")

    monkeypatch.setattr(operations, "_persist_exported_file", _fail_if_called)

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="/workspace/out.txt",
    )

    assert result["success"] is False
    assert "maximum allowed size" in result["error"]
    assert manager.read_paths == ["/workspace/out.txt"]


@pytest.mark.asyncio
async def test_sandbox_export_success(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = _DummyManager(payload=b"hello export")

    async def _persist_stub(
        *,
        user_id: str,
        session_id: str,
        sandbox_path: str,
        filename: str,
        file_bytes: bytes,
    ) -> dict[str, object]:
        assert user_id == "user-1"
        assert session_id == "session-1"
        assert sandbox_path == "/workspace/build/output.log"
        assert filename == "output.log"
        assert file_bytes == b"hello export"
        return {
            "success": True,
            "file_id": "file-123",
            "download_url": "/xyzen/api/v1/files/file-123/download",
        }

    monkeypatch.setattr(operations, "_persist_exported_file", _persist_stub)

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="/workspace/build/output.log",
    )

    assert result["success"] is True
    assert result["file_id"] == "file-123"
    assert result["sandbox_path"] == "/workspace/build/output.log"
    assert manager.read_paths == ["/workspace/build/output.log"]


@pytest.mark.asyncio
async def test_sandbox_export_rejects_path_like_filename() -> None:
    manager = _DummyManager(payload=b"hello export")

    result = await operations.sandbox_export(
        manager=cast(SandboxManager, manager),
        user_id="user-1",
        session_id="session-1",
        path="/workspace/build/output.log",
        filename="docs/output.log",
    )

    assert result["success"] is False
    assert "path separators" in result["error"]
    assert manager.read_paths == []
