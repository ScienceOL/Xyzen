"""Unit tests for CoreMemoryBlock schema."""

import pytest

from app.core.memory.schemas import CORE_MEMORY_SECTIONS, CoreMemoryBlock


class TestCoreMemorySections:
    def test_all_four_sections_defined(self) -> None:
        assert len(CORE_MEMORY_SECTIONS) == 4
        assert "user_summary" in CORE_MEMORY_SECTIONS
        assert "preferences" in CORE_MEMORY_SECTIONS
        assert "active_context" in CORE_MEMORY_SECTIONS
        assert "working_rules" in CORE_MEMORY_SECTIONS


class TestCoreMemoryBlock:
    def test_default_empty(self) -> None:
        block = CoreMemoryBlock()
        assert block.user_summary == ""
        assert block.preferences == ""
        assert block.active_context == ""
        assert block.working_rules == ""

    def test_is_empty_when_all_blank(self) -> None:
        block = CoreMemoryBlock()
        assert block.is_empty() is True

    def test_is_empty_with_whitespace_only(self) -> None:
        block = CoreMemoryBlock(user_summary="   ", preferences="\n")
        assert block.is_empty() is True

    def test_is_not_empty_with_content(self) -> None:
        block = CoreMemoryBlock(user_summary="Alice")
        assert block.is_empty() is False

    def test_to_prompt_text_empty_returns_empty(self) -> None:
        block = CoreMemoryBlock()
        assert block.to_prompt_text() == ""

    def test_to_prompt_text_renders_xml(self) -> None:
        block = CoreMemoryBlock(
            user_summary="Alice, researcher",
            preferences="concise answers",
        )
        text = block.to_prompt_text()
        assert "<CORE_MEMORY>" in text
        assert "</CORE_MEMORY>" in text
        assert "<user_summary>Alice, researcher</user_summary>" in text
        assert "<preferences>concise answers</preferences>" in text
        # Empty sections should not appear
        assert "<active_context>" not in text
        assert "<working_rules>" not in text

    def test_to_prompt_text_strips_whitespace(self) -> None:
        block = CoreMemoryBlock(user_summary="  Alice  ")
        text = block.to_prompt_text()
        assert "<user_summary>Alice</user_summary>" in text

    def test_to_prompt_text_escapes_xml(self) -> None:
        block = CoreMemoryBlock(user_summary="a < b & c > d")
        text = block.to_prompt_text()
        assert "a &lt; b &amp; c &gt; d" in text
        # No raw < or > in the value portion
        assert "<user_summary>a &lt; b &amp; c &gt; d</user_summary>" in text

    def test_to_prompt_text_escapes_xml_injection(self) -> None:
        """Verify that XML tag injection in content is neutralized."""
        block = CoreMemoryBlock(user_summary="</user_summary><INJECTION>evil</INJECTION>")
        text = block.to_prompt_text()
        # The closing tag should be escaped, not interpreted as XML
        assert "&lt;/user_summary&gt;" in text
        assert "&lt;INJECTION&gt;" in text

    def test_model_dump_roundtrip(self) -> None:
        block = CoreMemoryBlock(
            user_summary="Alice",
            preferences="formal",
            active_context="project X",
            working_rules="no emojis",
        )
        dumped = block.model_dump()
        restored = CoreMemoryBlock.model_validate(dumped)
        assert restored == block

    def test_model_dump_json_roundtrip(self) -> None:
        block = CoreMemoryBlock(user_summary="Alice", preferences="formal")
        json_str = block.model_dump_json()
        restored = CoreMemoryBlock.model_validate_json(json_str)
        assert restored == block

    @pytest.mark.parametrize("section", CORE_MEMORY_SECTIONS)
    def test_max_length_enforced(self, section: str) -> None:
        """Pydantic should reject content exceeding max_length=500."""
        with pytest.raises(Exception):
            CoreMemoryBlock(**{section: "x" * 501})
