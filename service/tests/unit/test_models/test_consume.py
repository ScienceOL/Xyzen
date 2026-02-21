"""Unit tests for consume models (ConsumeRecord, UserConsumeSummary and their schemas)."""

from uuid import uuid4

from app.models.consume import (
    ConsumeRecordCreate,
    ConsumeRecordUpdate,
    DailyConsumeSummary,
    LLMUsageRecord,
    ToolCallRecord,
    UserConsumeSummaryCreate,
    UserConsumeSummaryUpdate,
)


class TestConsumeRecordCreate:
    def test_defaults(self) -> None:
        record = ConsumeRecordCreate(
            user_id="user-1",
            amount=100,
            auth_provider="test",
        )
        assert record.consume_state == "pending"
        assert record.input_tokens is None
        assert record.output_tokens is None
        assert record.total_tokens is None
        assert record.session_id is None
        assert record.topic_id is None
        assert record.model_tier is None

    def test_all_fields(self) -> None:
        sid = uuid4()
        tid = uuid4()
        mid = uuid4()
        record = ConsumeRecordCreate(
            user_id="user-1",
            amount=500,
            auth_provider="bohr",
            sku_id=1,
            scene="chat",
            session_id=sid,
            topic_id=tid,
            message_id=mid,
            description="test consume",
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            model_tier="pro",
            tier_rate=3.0,
            calculation_breakdown='{"base": 1}',
            consume_state="success",
            remote_error=None,
            remote_response='{"ok": true}',
        )
        assert record.amount == 500
        assert record.session_id == sid
        assert record.model_tier == "pro"
        assert record.tier_rate == 3.0


class TestConsumeRecordUpdate:
    def test_all_none_by_default(self) -> None:
        update = ConsumeRecordUpdate()
        data = update.model_dump(exclude_unset=True)
        assert data == {}

    def test_partial_update(self) -> None:
        update = ConsumeRecordUpdate(amount=999, consume_state="success")
        data = update.model_dump(exclude_unset=True)
        assert data == {"amount": 999, "consume_state": "success"}


class TestUserConsumeSummaryCreate:
    def test_defaults(self) -> None:
        summary = UserConsumeSummaryCreate(
            user_id="user-1",
            auth_provider="test",
        )
        assert summary.total_amount == 0
        assert summary.total_count == 0
        assert summary.success_count == 0
        assert summary.failed_count == 0

    def test_with_values(self) -> None:
        summary = UserConsumeSummaryCreate(
            user_id="user-1",
            auth_provider="test",
            total_amount=1000,
            total_count=10,
            success_count=8,
            failed_count=2,
        )
        assert summary.total_amount == 1000
        assert summary.success_count == 8


class TestUserConsumeSummaryUpdate:
    def test_partial_update(self) -> None:
        update = UserConsumeSummaryUpdate(total_amount=500)
        data = update.model_dump(exclude_unset=True)
        assert data == {"total_amount": 500}

    def test_all_none_by_default(self) -> None:
        update = UserConsumeSummaryUpdate()
        data = update.model_dump(exclude_unset=True)
        assert data == {}


class TestLLMUsageRecord:
    def test_required_fields(self) -> None:
        record = LLMUsageRecord(
            user_id="user-1",
            model_name="gpt-4o",
        )
        assert record.user_id == "user-1"
        assert record.model_name == "gpt-4o"
        assert record.id is not None

    def test_defaults(self) -> None:
        record = LLMUsageRecord(
            user_id="user-1",
            model_name="gpt-4o",
        )
        assert record.input_tokens == 0
        assert record.output_tokens == 0
        assert record.total_tokens == 0
        assert record.cache_creation_input_tokens == 0
        assert record.cache_read_input_tokens == 0
        assert record.source == "chat"
        assert record.model_tier is None
        assert record.provider is None
        assert record.session_id is None
        assert record.topic_id is None
        assert record.message_id is None

    def test_all_fields(self) -> None:
        sid = uuid4()
        tid = uuid4()
        mid = uuid4()
        record = LLMUsageRecord(
            user_id="user-1",
            model_name="gpt-4o",
            model_tier="pro",
            provider="openai",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
            cache_creation_input_tokens=10,
            cache_read_input_tokens=5,
            source="subagent",
            session_id=sid,
            topic_id=tid,
            message_id=mid,
        )
        assert record.model_tier == "pro"
        assert record.provider == "openai"
        assert record.input_tokens == 100
        assert record.output_tokens == 50
        assert record.total_tokens == 150
        assert record.source == "subagent"
        assert record.session_id == sid


class TestToolCallRecord:
    def test_required_fields(self) -> None:
        record = ToolCallRecord(
            user_id="user-1",
            tool_name="web_search",
        )
        assert record.user_id == "user-1"
        assert record.tool_name == "web_search"
        assert record.id is not None

    def test_defaults(self) -> None:
        record = ToolCallRecord(
            user_id="user-1",
            tool_name="web_search",
        )
        assert record.status == "success"
        assert record.tool_call_id is None
        assert record.model_tier is None
        assert record.session_id is None
        assert record.topic_id is None
        assert record.message_id is None

    def test_all_fields(self) -> None:
        sid = uuid4()
        record = ToolCallRecord(
            user_id="user-1",
            tool_name="generate_image",
            tool_call_id="call_abc",
            status="error",
            model_tier="ultra",
            session_id=sid,
        )
        assert record.tool_name == "generate_image"
        assert record.tool_call_id == "call_abc"
        assert record.status == "error"
        assert record.model_tier == "ultra"


class TestDailyConsumeSummary:
    def test_required_fields(self) -> None:
        summary = DailyConsumeSummary(
            user_id="user-1",
            date="2025-01-15",
        )
        assert summary.user_id == "user-1"
        assert summary.date == "2025-01-15"
        assert summary.id is not None

    def test_defaults(self) -> None:
        summary = DailyConsumeSummary(
            user_id="user-1",
            date="2025-01-15",
        )
        assert summary.tz == "Asia/Shanghai"
        assert summary.total_input_tokens == 0
        assert summary.total_output_tokens == 0
        assert summary.total_tokens == 0
        assert summary.total_credits == 0
        assert summary.llm_call_count == 0
        assert summary.tool_call_count == 0
        assert summary.total_cost_cents == 0
        assert summary.by_tier is None
        assert summary.by_model is None

    def test_json_fields(self) -> None:
        summary = DailyConsumeSummary(
            user_id="user-1",
            date="2025-01-15",
            by_tier={"pro": {"tokens": 100, "credits": 10}},
            by_model={"gpt-4o": {"input_tokens": 50, "output_tokens": 50}},
        )
        assert summary.by_tier["pro"]["tokens"] == 100
        assert summary.by_model["gpt-4o"]["input_tokens"] == 50
