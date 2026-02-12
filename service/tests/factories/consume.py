from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.consume import (
    ConsumeRecordCreate,
    UserConsumeSummaryCreate,
)


class ConsumeRecordCreateFactory(ModelFactory[ConsumeRecordCreate]):
    """Factory for ConsumeRecordCreate schema."""

    __model__ = ConsumeRecordCreate

    user_id = Use(lambda: "test-user")
    amount = Use(lambda: 100)
    auth_provider = "test_auth"
    consume_state = "success"
    input_tokens = Use(lambda: 1000)
    output_tokens = Use(lambda: 500)
    total_tokens = Use(lambda: 1500)
    sku_id = None
    scene = None
    session_id = None
    topic_id = None
    message_id = None
    description = None
    model_tier = None
    tier_rate = None
    calculation_breakdown = None
    remote_error = None
    remote_response = None


class UserConsumeSummaryCreateFactory(ModelFactory[UserConsumeSummaryCreate]):
    """Factory for UserConsumeSummaryCreate schema."""

    __model__ = UserConsumeSummaryCreate

    user_id = Use(lambda: "test-user")
    auth_provider = "test_auth"
    total_amount = Use(lambda: 0)
    total_count = Use(lambda: 0)
    success_count = Use(lambda: 0)
    failed_count = Use(lambda: 0)
