import pytest

from app.core.skills.storage import (
    MAX_SKILL_RESOURCE_FILE_BYTES,
    MAX_SKILL_RESOURCE_FILES,
    MAX_SKILL_RESOURCE_TOTAL_BYTES,
    normalize_inline_resources,
)


def test_normalize_inline_resources_accepts_text_resources():
    resources = [
        {"path": "scripts/run.customext", "content": "echo hello"},
        {"path": "references/notes", "content": "plain text"},
    ]

    normalized = normalize_inline_resources(resources)

    assert normalized == [
        ("scripts/run.customext", "echo hello"),
        ("references/notes", "plain text"),
    ]


def test_normalize_inline_resources_rejects_excessive_file_count():
    resources = [{"path": f"scripts/{index}.txt", "content": "x"} for index in range(MAX_SKILL_RESOURCE_FILES + 1)]

    with pytest.raises(ValueError, match="Too many resource files"):
        normalize_inline_resources(resources)


def test_normalize_inline_resources_rejects_large_single_file():
    large_content = "a" * (MAX_SKILL_RESOURCE_FILE_BYTES + 1)
    resources = [{"path": "scripts/large.txt", "content": large_content}]

    with pytest.raises(ValueError, match="exceeds max size"):
        normalize_inline_resources(resources)


def test_normalize_inline_resources_rejects_large_total_payload():
    chunks = MAX_SKILL_RESOURCE_TOTAL_BYTES // MAX_SKILL_RESOURCE_FILE_BYTES + 1
    resources = [
        {"path": f"scripts/{index}.txt", "content": "a" * MAX_SKILL_RESOURCE_FILE_BYTES} for index in range(chunks)
    ]

    with pytest.raises(ValueError, match="Total resource size exceeds max"):
        normalize_inline_resources(resources)


def test_normalize_inline_resources_rejects_non_utf8_text():
    resources = [
        {"path": "scripts/bad.txt", "content": "\ud800"},
    ]

    with pytest.raises(ValueError, match="not valid UTF-8 text"):
        normalize_inline_resources(resources)
