"""Unit tests for consume models (ConsumeRecord, UserConsumeSummary and their schemas)."""

from uuid import uuid4

from app.models.consume import (
    ConsumeRecord,
    ConsumeRecordCreate,
    ConsumeRecordUpdate,
    UserConsumeSummaryCreate,
    UserConsumeSummaryUpdate,
)


class TestConsumeRecordCreate:
    def test_defaults_llm(self) -> None:
        record = ConsumeRecordCreate(
            record_type="llm",
            user_id="user-1",
            auth_provider="test",
        )
        assert record.consume_state == "pending"
        assert record.amount == 0
        assert record.cost_usd == 0.0
        assert record.input_tokens == 0
        assert record.output_tokens == 0
        assert record.total_tokens == 0
        assert record.session_id is None
        assert record.topic_id is None
        assert record.model_tier is None
        assert record.tool_name is None

    def test_defaults_tool_call(self) -> None:
        record = ConsumeRecordCreate(
            record_type="tool_call",
            user_id="user-1",
            auth_provider="test",
        )
        assert record.consume_state == "pending"
        assert record.amount == 0
        assert record.cost_usd == 0.0
        assert record.model_name is None
        assert record.tool_name is None
        assert record.status == "success"

    def test_all_fields_llm(self) -> None:
        sid = uuid4()
        tid = uuid4()
        mid = uuid4()
        record = ConsumeRecordCreate(
            record_type="llm",
            user_id="user-1",
            auth_provider="bohr",
            amount=500,
            cost_usd=0.0105,
            session_id=sid,
            topic_id=tid,
            message_id=mid,
            description="test consume",
            model_name="gpt-4o",
            model_tier="pro",
            provider="openai",
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            cache_creation_input_tokens=10,
            cache_read_input_tokens=5,
            source="chat",
            consume_state="success",
        )
        assert record.amount == 500
        assert record.cost_usd == 0.0105
        assert record.session_id == sid
        assert record.model_tier == "pro"
        assert record.provider == "openai"
        assert record.input_tokens == 1000
        assert record.source == "chat"

    def test_all_fields_tool_call(self) -> None:
        sid = uuid4()
        tid = uuid4()
        record = ConsumeRecordCreate(
            record_type="tool_call",
            user_id="user-1",
            auth_provider="bohr",
            amount=10,
            session_id=sid,
            topic_id=tid,
            tool_name="generate_image",
            tool_call_id="call_abc",
            status="success",
            model_tier="ultra",
            consume_state="pending",
        )
        assert record.tool_name == "generate_image"
        assert record.tool_call_id == "call_abc"
        assert record.status == "success"
        assert record.model_tier == "ultra"


class TestConsumeRecordUpdate:
    def test_all_none_by_default(self) -> None:
        update = ConsumeRecordUpdate()
        data = update.model_dump(exclude_unset=True)
        assert data == {}

    def test_partial_update(self) -> None:
        update = ConsumeRecordUpdate(amount=999, consume_state="success")
        data = update.model_dump(exclude_unset=True)
        assert data == {"amount": 999, "consume_state": "success"}

    def test_update_message_id(self) -> None:
        mid = uuid4()
        update = ConsumeRecordUpdate(message_id=mid)
        data = update.model_dump(exclude_unset=True)
        assert data == {"message_id": mid}

    def test_update_description(self) -> None:
        update = ConsumeRecordUpdate(description="settled")
        data = update.model_dump(exclude_unset=True)
        assert data == {"description": "settled"}


class TestConsumeRecord:
    def test_llm_record(self) -> None:
        record = ConsumeRecord(
            record_type="llm",
            user_id="user-1",
            auth_provider="test",
            model_name="gpt-4o",
            model_tier="pro",
            provider="openai",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
        )
        assert record.record_type == "llm"
        assert record.model_name == "gpt-4o"
        assert record.id is not None

    def test_tool_call_record(self) -> None:
        record = ConsumeRecord(
            record_type="tool_call",
            user_id="user-1",
            auth_provider="test",
            tool_name="web_search",
            tool_call_id="call_123",
            status="success",
        )
        assert record.record_type == "tool_call"
        assert record.tool_name == "web_search"
        assert record.id is not None

    def test_defaults(self) -> None:
        record = ConsumeRecord(
            record_type="llm",
            user_id="user-1",
            auth_provider="test",
        )
        assert record.amount == 0
        assert record.consume_state == "pending"
        assert record.cost_usd == 0.0
        assert record.input_tokens == 0
        assert record.output_tokens == 0
        assert record.total_tokens == 0
        assert record.cache_creation_input_tokens == 0
        assert record.cache_read_input_tokens == 0
        assert record.source == "chat"
        assert record.status == "success"
        assert record.model_name is None
        assert record.tool_name is None


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
