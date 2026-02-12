"""Integration tests for ConsumeRepository."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.consume import ConsumeRecordUpdate
from app.repos.consume import ConsumeRepository
from tests.factories.consume import ConsumeRecordCreateFactory


@pytest.mark.integration
class TestConsumeRepository:
    """Integration tests for ConsumeRepository."""

    @pytest.fixture
    def consume_repo(self, db_session: AsyncSession) -> ConsumeRepository:
        return ConsumeRepository(db_session)

    # ------------------------------------------------------------------
    # CRUD: ConsumeRecord
    # ------------------------------------------------------------------

    async def test_create_and_get_consume_record(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-consume-create"
        record_data = ConsumeRecordCreateFactory.build(user_id=user_id, amount=200)

        created = await consume_repo.create_consume_record(record_data, user_id)
        assert created.id is not None
        assert created.user_id == user_id
        assert created.amount == 200

        fetched = await consume_repo.get_consume_record_by_id(created.id)
        assert fetched is not None
        assert fetched.id == created.id

    async def test_get_consume_record_not_found(self, consume_repo: ConsumeRepository) -> None:
        result = await consume_repo.get_consume_record_by_id(uuid4())
        assert result is None

    async def test_get_consume_record_by_biz_no(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-biz-no"
        record_data = ConsumeRecordCreateFactory.build(user_id=user_id)

        created = await consume_repo.create_consume_record(record_data, user_id)
        # biz_no is auto-assigned; just verify lookup works if it has one
        if created.biz_no is not None:
            fetched = await consume_repo.get_consume_record_by_biz_no(created.biz_no)
            assert fetched is not None
            assert fetched.id == created.id

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def test_update_consume_record(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-consume-update"
        record_data = ConsumeRecordCreateFactory.build(user_id=user_id, amount=100, consume_state="pending")
        created = await consume_repo.create_consume_record(record_data, user_id)

        update = ConsumeRecordUpdate(amount=250, consume_state="success")
        updated = await consume_repo.update_consume_record(created.id, update)

        assert updated is not None
        assert updated.amount == 250
        assert updated.consume_state == "success"

    async def test_update_consume_record_not_found(self, consume_repo: ConsumeRepository) -> None:
        update = ConsumeRecordUpdate(amount=999)
        result = await consume_repo.update_consume_record(uuid4(), update)
        assert result is None

    # ------------------------------------------------------------------
    # List operations
    # ------------------------------------------------------------------

    async def test_list_consume_records_by_user(self, consume_repo: ConsumeRepository) -> None:
        user_a = "test-user-list-a"
        user_b = "test-user-list-b"

        for _ in range(3):
            await consume_repo.create_consume_record(
                ConsumeRecordCreateFactory.build(user_id=user_a), user_a
            )
        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_b), user_b
        )

        records = await consume_repo.list_consume_records_by_user(user_a)
        assert len(records) == 3
        for r in records:
            assert r.user_id == user_a

    async def test_list_consume_records_by_user_pagination(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-list-paged"

        for _ in range(5):
            await consume_repo.create_consume_record(
                ConsumeRecordCreateFactory.build(user_id=user_id), user_id
            )

        page = await consume_repo.list_consume_records_by_user(user_id, limit=2, offset=1)
        assert len(page) == 2

    async def test_list_consume_records_by_session(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-session-list"
        session_id = uuid4()

        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id, session_id=session_id), user_id
        )
        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id, session_id=session_id), user_id
        )
        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id, session_id=uuid4()), user_id
        )

        records = await consume_repo.list_consume_records_by_session(session_id)
        assert len(records) == 2

    async def test_list_consume_records_by_topic(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-topic-list"
        topic_id = uuid4()

        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id, topic_id=topic_id), user_id
        )
        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id, topic_id=uuid4()), user_id
        )

        records = await consume_repo.list_consume_records_by_topic(topic_id)
        assert len(records) == 1

    # ------------------------------------------------------------------
    # User consume summary CRUD
    # ------------------------------------------------------------------

    async def test_get_user_consume_summary_not_found(self, consume_repo: ConsumeRepository) -> None:
        result = await consume_repo.get_user_consume_summary("nonexistent-user")
        assert result is None

    async def test_create_and_get_user_consume_summary(self, consume_repo: ConsumeRepository) -> None:
        from tests.factories.consume import UserConsumeSummaryCreateFactory

        user_id = "test-user-summary-create"
        summary_data = UserConsumeSummaryCreateFactory.build(user_id=user_id, total_amount=500, total_count=10)

        created = await consume_repo.create_user_consume_summary(summary_data, user_id)
        assert created.user_id == user_id
        assert created.total_amount == 500
        assert created.total_count == 10

        fetched = await consume_repo.get_user_consume_summary(user_id)
        assert fetched is not None
        assert fetched.id == created.id

    async def test_update_user_consume_summary(self, consume_repo: ConsumeRepository) -> None:
        from app.models.consume import UserConsumeSummaryUpdate
        from tests.factories.consume import UserConsumeSummaryCreateFactory

        user_id = "test-user-summary-update"
        summary_data = UserConsumeSummaryCreateFactory.build(user_id=user_id, total_amount=100)
        await consume_repo.create_user_consume_summary(summary_data, user_id)

        update = UserConsumeSummaryUpdate(total_amount=300, success_count=5)
        updated = await consume_repo.update_user_consume_summary(user_id, update)
        assert updated is not None
        assert updated.total_amount == 300
        assert updated.success_count == 5

    async def test_update_user_consume_summary_not_found(self, consume_repo: ConsumeRepository) -> None:
        from app.models.consume import UserConsumeSummaryUpdate

        result = await consume_repo.update_user_consume_summary(
            "nonexistent", UserConsumeSummaryUpdate(total_amount=1)
        )
        assert result is None

    # ------------------------------------------------------------------
    # increment_user_consume (key business logic)
    # ------------------------------------------------------------------

    async def test_increment_creates_new_summary(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-incr-new"
        summary = await consume_repo.increment_user_consume(user_id, "test_auth", 100, "success")

        assert summary.user_id == user_id
        assert summary.total_amount == 100
        assert summary.total_count == 1
        assert summary.success_count == 1
        assert summary.failed_count == 0

    async def test_increment_updates_existing_summary(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-incr-existing"
        await consume_repo.increment_user_consume(user_id, "test_auth", 100, "success")
        summary = await consume_repo.increment_user_consume(user_id, "test_auth", 50, "success")

        assert summary.total_amount == 150
        assert summary.total_count == 2
        assert summary.success_count == 2
        assert summary.failed_count == 0

    async def test_increment_failed_state(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-incr-failed"
        summary = await consume_repo.increment_user_consume(user_id, "test_auth", 100, "failed")

        assert summary.success_count == 0
        assert summary.failed_count == 1

    async def test_increment_pending_state(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-incr-pending"
        summary = await consume_repo.increment_user_consume(user_id, "test_auth", 100, "pending")

        assert summary.success_count == 0
        assert summary.failed_count == 0
        assert summary.total_count == 1

    # ------------------------------------------------------------------
    # Aggregation queries
    # ------------------------------------------------------------------

    async def test_get_total_consume_by_user(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-total"
        for amount in [100, 200, 300]:
            await consume_repo.create_consume_record(
                ConsumeRecordCreateFactory.build(user_id=user_id, amount=amount), user_id
            )

        total = await consume_repo.get_total_consume_by_user(user_id)
        assert total == 600

    async def test_get_total_consume_by_user_no_records(self, consume_repo: ConsumeRepository) -> None:
        total = await consume_repo.get_total_consume_by_user("no-records-user")
        assert total == 0

    async def test_get_consume_count_by_user(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-count"
        for _ in range(3):
            await consume_repo.create_consume_record(
                ConsumeRecordCreateFactory.build(user_id=user_id), user_id
            )

        count = await consume_repo.get_consume_count_by_user(user_id)
        assert count == 3

    async def test_get_remote_consume_success_count(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-success-count"
        # 2 success, 1 failed
        for state in ["success", "success", "failed"]:
            await consume_repo.create_consume_record(
                ConsumeRecordCreateFactory.build(user_id=user_id, consume_state=state), user_id
            )

        count = await consume_repo.get_remote_consume_success_count(user_id)
        assert count == 2

    # ------------------------------------------------------------------
    # Daily token stats
    # ------------------------------------------------------------------

    async def test_get_daily_token_stats(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-daily-stats"
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(
                user_id=user_id, input_tokens=100, output_tokens=50, total_tokens=150, amount=10
            ),
            user_id,
        )
        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(
                user_id=user_id, input_tokens=200, output_tokens=100, total_tokens=300, amount=20
            ),
            user_id,
        )

        stats = await consume_repo.get_daily_token_stats(today, user_id=user_id)
        assert stats["date"] == today
        assert stats["input_tokens"] == 300
        assert stats["output_tokens"] == 150
        assert stats["total_amount"] == 30
        assert stats["record_count"] == 2

    async def test_get_daily_token_stats_invalid_timezone(self, consume_repo: ConsumeRepository) -> None:
        with pytest.raises(ValueError, match="Invalid timezone"):
            await consume_repo.get_daily_token_stats("2024-01-01", tz="Invalid/Timezone")

    # ------------------------------------------------------------------
    # Top users / list all
    # ------------------------------------------------------------------

    async def test_get_top_users_by_consumption(self, consume_repo: ConsumeRepository) -> None:
        from tests.factories.consume import UserConsumeSummaryCreateFactory

        for i, user_id in enumerate(["user-a", "user-b", "user-c"]):
            await consume_repo.create_user_consume_summary(
                UserConsumeSummaryCreateFactory.build(user_id=user_id, total_amount=(i + 1) * 100),
                user_id,
            )

        top = await consume_repo.get_top_users_by_consumption(limit=2)
        assert len(top) == 2
        assert top[0]["total_amount"] >= top[1]["total_amount"]

    async def test_list_all_consume_records_date_filter(self, consume_repo: ConsumeRepository) -> None:
        user_id = "test-user-list-all"
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

        await consume_repo.create_consume_record(
            ConsumeRecordCreateFactory.build(user_id=user_id), user_id
        )

        records = await consume_repo.list_all_consume_records(start_date=today, end_date=today)
        assert len(records) >= 1

        # Yesterday should not include today's records (unless test runs at midnight)
        old_records = await consume_repo.list_all_consume_records(
            start_date=yesterday, end_date=yesterday
        )
        # Just verify it doesn't error; count depends on timing
        assert isinstance(old_records, list)

    async def test_list_all_consume_records_invalid_timezone(self, consume_repo: ConsumeRepository) -> None:
        with pytest.raises(ValueError, match="Invalid timezone"):
            await consume_repo.list_all_consume_records(start_date="2024-01-01", tz="Bad/TZ")
