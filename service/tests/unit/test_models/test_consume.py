"""Unit tests for consume models (ConsumeRecord, UserConsumeSummary and their schemas)."""

from uuid import uuid4

from app.models.consume import (
    ConsumeRecordCreate,
    ConsumeRecordUpdate,
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
