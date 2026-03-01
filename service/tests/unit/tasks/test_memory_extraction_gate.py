"""Unit tests for memory extraction heuristic gate."""

from types import SimpleNamespace

from app.tasks.memory import SIGNAL_KEYWORDS, _should_extract


def _make_msg(role: str, content: str | None) -> SimpleNamespace:
    """Create a lightweight message-like object for testing."""
    return SimpleNamespace(role=role, content=content)


class TestShouldExtract:
    """Test the heuristic pre-filter for memory extraction."""

    def test_skips_single_user_message(self) -> None:
        msgs = [
            _make_msg("user", "Hello"),
            _make_msg("assistant", "Hi there! How can I help?"),
        ]
        assert _should_extract(msgs) is False

    def test_skips_short_conversation(self) -> None:
        msgs = [
            _make_msg("user", "Hi"),
            _make_msg("assistant", "Hello!"),
            _make_msg("user", "Bye"),
            _make_msg("assistant", "Goodbye!"),
        ]
        assert _should_extract(msgs) is False

    def test_extracts_on_english_keyword(self) -> None:
        msgs = [
            _make_msg(
                "user",
                "I prefer Python over JavaScript for backend work. I've been using it for about five years now and really enjoy the ecosystem.",
            ),
            _make_msg(
                "assistant",
                "That's a solid choice for backend development. Python has a rich ecosystem with frameworks like FastAPI, Django, and Flask that make building APIs straightforward.",
            ),
            _make_msg(
                "user",
                "Yes, I always use type hints too. It helps catch bugs early and makes the code more readable for the team.",
            ),
            _make_msg(
                "assistant",
                "Great practice! Type hints combined with tools like mypy or pyright can significantly improve code quality.",
            ),
        ]
        assert _should_extract(msgs) is True

    def test_extracts_on_chinese_keyword(self) -> None:
        msgs = [
            _make_msg(
                "user", "我喜欢用 Python 写后端，效率很高。已经用了五年了，生态系统非常丰富，各种库和框架都很成熟。"
            ),
            _make_msg("assistant", "Python 确实是后端开发的好选择。FastAPI、Django 等框架都非常优秀，社区也很活跃。"),
            _make_msg("user", "我习惯用 FastAPI 框架，配合 SQLModel 做数据库操作，开发体验非常好。"),
            _make_msg("assistant", "FastAPI 性能很好，而且原生支持异步，搭配 SQLModel 确实是很好的组合。"),
        ]
        assert _should_extract(msgs) is True

    def test_extracts_on_japanese_keyword(self) -> None:
        msgs = [
            _make_msg(
                "user",
                "私はPythonをバックエンド開発に使っています。もう5年になりますが、エコシステムが非常に充実していて気に入っています。",
            ),
            _make_msg(
                "assistant",
                "Pythonはバックエンド開発に最適ですね。FastAPIやDjangoなど、優れたフレームワークが豊富に揃っています。",
            ),
            _make_msg(
                "user",
                "いつもFastAPIを使っています。非同期処理のサポートが素晴らしく、パフォーマンスも申し分ありません。",
            ),
            _make_msg(
                "assistant",
                "FastAPIはパフォーマンスが良いですね。型ヒントのネイティブサポートも開発体験を向上させます。",
            ),
        ]
        assert _should_extract(msgs) is True

    def test_extracts_on_long_conversation_fallback(self) -> None:
        """Long conversations without keywords should still be extracted."""
        msgs = [
            _make_msg("user", "Can you explain how async works in Python?"),
            _make_msg("assistant", "Sure! Async in Python uses the asyncio library..." + "x" * 200),
            _make_msg("user", "What about the event loop?"),
            _make_msg("assistant", "The event loop is the core of asyncio..." + "x" * 200),
            _make_msg("user", "How does it compare to threading?"),
            _make_msg("assistant", "Threading vs async is a common question..." + "x" * 200),
        ]
        assert _should_extract(msgs) is True

    def test_skips_medium_conversation_without_keywords(self) -> None:
        """Medium conversation without keywords and below long threshold."""
        msgs = [
            _make_msg("user", "What is 2 + 2?"),
            _make_msg("assistant", "The answer is 4."),
            _make_msg("user", "And 3 + 3?"),
            _make_msg("assistant", "That would be 6."),
        ]
        assert _should_extract(msgs) is False

    def test_empty_messages(self) -> None:
        assert _should_extract([]) is False

    def test_assistant_only_messages(self) -> None:
        msgs = [
            _make_msg("assistant", "Hello! How can I help you today?"),
            _make_msg("assistant", "Is there anything else you need?"),
        ]
        assert _should_extract(msgs) is False

    def test_none_content_handled(self) -> None:
        """Messages with None content should not crash the gate."""
        msgs = [
            _make_msg("user", None),
            _make_msg("assistant", "I didn't catch that."),
            _make_msg("user", None),
            _make_msg("assistant", "Could you repeat?"),
        ]
        assert _should_extract(msgs) is False

    def test_keyword_case_insensitive(self) -> None:
        msgs = [
            _make_msg(
                "user",
                "I PREFER using dark mode in all my editors and IDEs. It reduces eye strain significantly during long coding sessions.",
            ),
            _make_msg(
                "assistant",
                "Dark mode is easier on the eyes, especially for extended development sessions. Most modern editors support it.",
            ),
            _make_msg(
                "user",
                "My Name is Alice and I work on AI projects at a research lab. We do a lot of machine learning and NLP work.",
            ),
            _make_msg(
                "assistant",
                "Nice to meet you, Alice! AI research sounds fascinating. What frameworks do you typically use?",
            ),
        ]
        assert _should_extract(msgs) is True


class TestSignalKeywords:
    """Verify signal keyword list properties."""

    def test_keywords_are_lowercase(self) -> None:
        """English keywords should be lowercase for case-insensitive matching."""
        for kw in SIGNAL_KEYWORDS:
            # CJK characters don't have case, so only check ASCII keywords
            if kw.isascii():
                assert kw == kw.lower(), f"Keyword '{kw}' should be lowercase"

    def test_has_english_keywords(self) -> None:
        assert any(kw.isascii() for kw in SIGNAL_KEYWORDS)

    def test_has_chinese_keywords(self) -> None:
        assert any("\u4e00" <= c <= "\u9fff" for kw in SIGNAL_KEYWORDS for c in kw)

    def test_has_japanese_keywords(self) -> None:
        assert any(("\u3040" <= c <= "\u309f") or ("\u30a0" <= c <= "\u30ff") for kw in SIGNAL_KEYWORDS for c in kw)
