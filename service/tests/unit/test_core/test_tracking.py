"""Unit tests for app.core.consume.tracking.ConsumptionTrackingService."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.consume.consume_service import ConsumptionTrackingService
from app.models.consume import ConsumeRecord


@pytest.mark.asyncio
class TestConsumptionTrackingServiceLLM:
    async def test_record_llm_usage_with_pricing(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        with patch(
            "app.core.consume.consume_service.calculate_llm_cost_usd",
            new_callable=AsyncMock,
            return_value=0.005,
        ):
            record = await service.record_llm_usage_with_pricing(
                user_id="user-1",
                auth_provider="test_auth",
                model_name="gpt-4o",
                model_tier="pro",
                provider="openai",
                input_tokens=10000,
                output_tokens=5000,
                total_tokens=15000,
                source="chat",
                session_id=uuid4(),
                topic_id=uuid4(),
            )

        assert isinstance(record, ConsumeRecord)
        assert record.record_type == "llm"
        assert record.user_id == "user-1"
        assert record.auth_provider == "test_auth"
        assert record.model_name == "gpt-4o"
        assert record.model_tier == "pro"
        assert record.provider == "openai"
        assert record.input_tokens == 10000
        assert record.output_tokens == 5000
        assert record.total_tokens == 15000
        assert record.amount > 0  # calculated from tier rate
        assert record.cost_usd == 0.005
        assert record.source == "chat"
        assert record.consume_state == "pending"
        assert record.id is not None

    async def test_record_llm_usage_with_pricing_defaults(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        with patch(
            "app.core.consume.consume_service.calculate_llm_cost_usd",
            new_callable=AsyncMock,
            return_value=0.0,
        ):
            record = await service.record_llm_usage_with_pricing(
                user_id="user-2",
                auth_provider="test_auth",
                model_name="gemini-3-pro-preview",
                model_tier=None,
                provider=None,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
            )

        assert record.source == "chat"
        assert record.amount == 0
        assert record.cost_usd == 0.0
        assert record.cache_creation_input_tokens == 0
        assert record.cache_read_input_tokens == 0
        assert record.model_tier is None
        assert record.provider is None
        assert record.consume_state == "pending"


@pytest.mark.asyncio
class TestConsumptionTrackingServiceToolCall:
    async def test_record_tool_call(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        record = await service.record_tool_call(
            user_id="user-1",
            auth_provider="test_auth",
            tool_name="generate_image",
            amount=10,
            tool_call_id="call_123",
            status="success",
            model_tier="pro",
            session_id=uuid4(),
            topic_id=uuid4(),
        )

        assert isinstance(record, ConsumeRecord)
        assert record.record_type == "tool_call"
        assert record.user_id == "user-1"
        assert record.auth_provider == "test_auth"
        assert record.tool_name == "generate_image"
        assert record.tool_call_id == "call_123"
        assert record.status == "success"
        assert record.model_tier == "pro"
        assert record.amount == 10
        assert record.cost_usd == 0.0
        assert record.consume_state == "pending"
        assert record.id is not None

    async def test_record_tool_call_defaults(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        record = await service.record_tool_call(
            user_id="user-1",
            auth_provider="test_auth",
            tool_name="web_search",
        )

        assert record.status == "success"
        assert record.amount == 0
        assert record.tool_call_id is None
        assert record.model_tier is None
        assert record.session_id is None

    async def test_record_tool_calls_batch(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        records = [
            ConsumeRecord(
                record_type="tool_call",
                user_id="user-1",
                auth_provider="test_auth",
                tool_name=f"tool_{i}",
                status="success",
            )
            for i in range(5)
        ]

        await service.record_tool_calls_batch(records)

        # Verify all records were inserted by querying
        from sqlmodel import select

        stmt = select(ConsumeRecord).where(
            ConsumeRecord.user_id == "user-1",
            ConsumeRecord.record_type == "tool_call",
        )
        result = await db_session.exec(stmt)
        persisted = list(result.all())
        assert len(persisted) == 5

    async def test_record_tool_calls_batch_empty(self, db_session) -> None:
        service = ConsumptionTrackingService(db_session)
        # Should not raise
        await service.record_tool_calls_batch([])
