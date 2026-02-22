from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage

from app.core.chat.langchain import _handle_messages_mode
from app.core.chat.stream_handlers import StreamContext, TokenStreamProcessor


class _NoopTracer:
    def detect_node_transition(self, _metadata):
        return None

    def get_current_node_id(self):
        return None

    def on_node_end(self, *_args, **_kwargs):
        return None

    def on_node_start(self, *_args, **_kwargs):
        return None


def test_normalize_usage_falls_back_to_input_output_sum() -> None:
    assert TokenStreamProcessor.normalize_usage(120, 34, 0) == (120, 34, 154)
    assert TokenStreamProcessor.normalize_usage(120, 34, None) == (120, 34, 154)


def test_extract_usage_metadata_returns_normalized_totals() -> None:
    chunk = SimpleNamespace(usage_metadata={"input_tokens": 80, "output_tokens": 20, "total_tokens": 0})
    assert TokenStreamProcessor.extract_usage_metadata(chunk) == (80, 20, 100, 0, 0)


def test_extract_usage_metadata_extracts_cache_tokens() -> None:
    chunk = SimpleNamespace(
        usage_metadata={
            "input_tokens": 100,
            "output_tokens": 20,
            "total_tokens": 120,
            "input_token_details": {"cache_creation": 30, "cache_read": 50},
        }
    )
    assert TokenStreamProcessor.extract_usage_metadata(chunk) == (100, 20, 120, 30, 50)


def test_extract_usage_metadata_handles_missing_cache_details() -> None:
    chunk = SimpleNamespace(usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120})
    assert TokenStreamProcessor.extract_usage_metadata(chunk) == (100, 20, 120, 0, 0)


@pytest.mark.asyncio
async def test_final_aimessage_skip_path_still_updates_usage() -> None:
    ctx = StreamContext(stream_id="stream-1", db=None, user_id="u-1")
    ctx.is_streaming = True
    ctx.assistant_buffer.append("already streamed")

    message = AIMessage(
        content="final content",
        usage_metadata={"input_tokens": 10, "output_tokens": 7, "total_tokens": 0},
    )

    events = [event async for event in _handle_messages_mode((message, {}), ctx, _NoopTracer())]

    assert events == []
    assert ctx.total_input_tokens == 10
    assert ctx.total_output_tokens == 7
    assert ctx.total_tokens == 17
