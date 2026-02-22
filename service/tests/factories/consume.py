from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.consume import (
    ConsumeRecordCreate,
    UserConsumeSummaryCreate,
)


class ConsumeRecordCreateFactory(ModelFactory[ConsumeRecordCreate]):
    """Factory for ConsumeRecordCreate schema."""

    __model__ = ConsumeRecordCreate

    record_type = "llm"
    user_id = Use(lambda: "test-user")
    auth_provider = "test_auth"
    amount = Use(lambda: 100)
    consume_state = "success"
    cost_usd = 0.0
    input_tokens = Use(lambda: 1000)
    output_tokens = Use(lambda: 500)
    total_tokens = Use(lambda: 1500)
    session_id = None
    topic_id = None
    message_id = None
    description = None
    model_name = None
    model_tier = None
    provider = None
    cache_creation_input_tokens = 0
    cache_read_input_tokens = 0
    source = "chat"
    tool_name = None
    tool_call_id = None
    status = "success"


class UserConsumeSummaryCreateFactory(ModelFactory[UserConsumeSummaryCreate]):
    """Factory for UserConsumeSummaryCreate schema."""

    __model__ = UserConsumeSummaryCreate

    user_id = Use(lambda: "test-user")
    auth_provider = "test_auth"
    total_amount = Use(lambda: 0)
    total_count = Use(lambda: 0)
    success_count = Use(lambda: 0)
    failed_count = Use(lambda: 0)
