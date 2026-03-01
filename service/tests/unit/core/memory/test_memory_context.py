"""Unit tests for MemoryContext and fetch_memory_context."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.memory.schemas import CoreMemoryBlock
from app.core.prompts.builder import MemoryContext, fetch_memory_context


class TestMemoryContext:
    def test_defaults(self) -> None:
        ctx = MemoryContext()
        assert ctx.core_memory_text == ""
        assert ctx.auto_retrieved == []

    def test_frozen(self) -> None:
        ctx = MemoryContext(core_memory_text="test", auto_retrieved=["a"])
        assert ctx.core_memory_text == "test"
        assert ctx.auto_retrieved == ["a"]


def _mock_configs(
    memory_enabled: bool = True,
    core_enabled: bool = False,
    auto_enabled: bool = False,
) -> MagicMock:
    cfg = MagicMock()
    cfg.Memory.Enabled = memory_enabled
    cfg.Memory.CoreMemory.Enabled = core_enabled
    cfg.Memory.AutoRetrieval.Enabled = auto_enabled
    return cfg


class TestFetchMemoryContext:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_user_id(self) -> None:
        result = await fetch_memory_context(None)
        assert result.core_memory_text == ""
        assert result.auto_retrieved == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_disabled(self) -> None:
        cfg = _mock_configs(memory_enabled=False)
        with patch("app.configs.configs", cfg):
            result = await fetch_memory_context("user-123")
        assert result.core_memory_text == ""

    @pytest.mark.asyncio
    async def test_returns_empty_when_service_unavailable(self) -> None:
        cfg = _mock_configs()
        mock_svc = MagicMock()
        mock_svc.store = None
        with (
            patch("app.configs.configs", cfg),
            patch(
                "app.core.memory.service.get_or_initialize_memory_service",
                new_callable=AsyncMock,
                return_value=mock_svc,
            ),
        ):
            result = await fetch_memory_context("user-123")
        assert result.core_memory_text == ""

    @pytest.mark.asyncio
    async def test_fetches_core_memory(self) -> None:
        cfg = _mock_configs(core_enabled=True)
        block = CoreMemoryBlock(user_summary="Alice")

        svc = AsyncMock()
        svc.store = MagicMock()
        svc.get_core_memory = AsyncMock(return_value=block)

        with (
            patch("app.configs.configs", cfg),
            patch(
                "app.core.memory.service.get_or_initialize_memory_service",
                new_callable=AsyncMock,
                return_value=svc,
            ),
        ):
            result = await fetch_memory_context("user-123")

        assert "<CORE_MEMORY>" in result.core_memory_text
        assert "Alice" in result.core_memory_text
        svc.get_core_memory.assert_called_once_with("user-123")

    @pytest.mark.asyncio
    async def test_fetches_auto_retrieval(self) -> None:
        cfg = _mock_configs(auto_enabled=True)

        svc = AsyncMock()
        svc.store = MagicMock()
        svc.auto_retrieve_memories = AsyncMock(return_value=["fact A", "fact B"])

        with (
            patch("app.configs.configs", cfg),
            patch(
                "app.core.memory.service.get_or_initialize_memory_service",
                new_callable=AsyncMock,
                return_value=svc,
            ),
        ):
            result = await fetch_memory_context("user-123", message_text="hello")

        assert result.auto_retrieved == ["fact A", "fact B"]
        svc.auto_retrieve_memories.assert_called_once_with("user-123", "hello")

    @pytest.mark.asyncio
    async def test_graceful_on_core_memory_failure(self) -> None:
        cfg = _mock_configs(core_enabled=True)

        svc = AsyncMock()
        svc.store = MagicMock()
        svc.get_core_memory = AsyncMock(side_effect=RuntimeError("db down"))

        with (
            patch("app.configs.configs", cfg),
            patch(
                "app.core.memory.service.get_or_initialize_memory_service",
                new_callable=AsyncMock,
                return_value=svc,
            ),
        ):
            result = await fetch_memory_context("user-123")

        assert result.core_memory_text == ""

    @pytest.mark.asyncio
    async def test_no_auto_retrieval_without_message_text(self) -> None:
        cfg = _mock_configs(auto_enabled=True)

        svc = AsyncMock()
        svc.store = MagicMock()
        svc.auto_retrieve_memories = AsyncMock()

        with (
            patch("app.configs.configs", cfg),
            patch(
                "app.core.memory.service.get_or_initialize_memory_service",
                new_callable=AsyncMock,
                return_value=svc,
            ),
        ):
            result = await fetch_memory_context("user-123", message_text=None)

        assert result.auto_retrieved == []
        svc.auto_retrieve_memories.assert_not_called()
