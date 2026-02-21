"""Unit tests for app.core.consume.context module."""

from uuid import uuid4

from app.core.consume.context import (
    TrackingContext,
    clear_tracking_context,
    get_tracking_context,
    set_tracking_context,
)


class TestTrackingContext:
    def test_default_is_none(self) -> None:
        clear_tracking_context()
        assert get_tracking_context() is None

    def test_set_and_get(self) -> None:
        ctx = TrackingContext(
            user_id="user-1",
            session_id=uuid4(),
            topic_id=uuid4(),
            message_id=uuid4(),
            model_tier="pro",
            db_session_factory=lambda: None,
        )
        set_tracking_context(ctx)
        try:
            result = get_tracking_context()
            assert result is ctx
            assert result.user_id == "user-1"
            assert result.model_tier == "pro"
        finally:
            clear_tracking_context()

    def test_clear(self) -> None:
        ctx = TrackingContext(
            user_id="user-2",
            session_id=None,
            topic_id=None,
            message_id=None,
            model_tier=None,
            db_session_factory=lambda: None,
        )
        set_tracking_context(ctx)
        assert get_tracking_context() is not None
        clear_tracking_context()
        assert get_tracking_context() is None

    def test_overwrite(self) -> None:
        ctx1 = TrackingContext(
            user_id="user-1",
            session_id=None,
            topic_id=None,
            message_id=None,
            model_tier=None,
            db_session_factory=lambda: None,
        )
        ctx2 = TrackingContext(
            user_id="user-2",
            session_id=None,
            topic_id=None,
            message_id=None,
            model_tier="ultra",
            db_session_factory=lambda: None,
        )
        set_tracking_context(ctx1)
        set_tracking_context(ctx2)
        try:
            result = get_tracking_context()
            assert result is ctx2
            assert result.user_id == "user-2"
        finally:
            clear_tracking_context()
