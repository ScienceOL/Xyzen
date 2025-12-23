from typing import Any, Generator
from unittest.mock import MagicMock

import pytest
from pytest_mock import MockerFixture

from app.mcp.knowledge import read_file


@pytest.fixture
def mock_deps(mocker: MockerFixture) -> Generator[tuple[MagicMock, MagicMock], None, None]:
    """Setup common mocks for knowledge tests."""
    mock_storage = mocker.MagicMock()
    mock_storage.download_file = mocker.AsyncMock()

    mock_file_repo = mocker.MagicMock()
    mock_file_repo.get_file_by_id = mocker.AsyncMock()

    mock_session = mocker.MagicMock()
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = None

    mocker.patch("app.mcp.knowledge._get_current_user_id", new_callable=mocker.AsyncMock, return_value="user123")
    mocker.patch("app.mcp.knowledge.AsyncSessionLocal", return_value=mock_session)
    mocker.patch("app.mcp.knowledge.FileRepository", return_value=mock_file_repo)
    mocker.patch(
        "app.mcp.knowledge._get_files_in_knowledge_set", new_callable=mocker.AsyncMock, return_value=["file123"]
    )
    mocker.patch("app.mcp.knowledge.get_storage_service", return_value=mock_storage)
    # mock_get_handler needs to be captured
    mock_get_handler = mocker.patch("app.mcp.file_handlers.FileHandlerFactory.get_handler")

    yield mock_file_repo, mock_get_handler


@pytest.mark.asyncio
async def test_read_file_image_limit_exceeded(mock_deps: tuple[MagicMock, MagicMock], mocker: MockerFixture) -> None:
    """Test that reading a file with > 5 images truncates the result."""
    mock_file_repo, mock_get_handler = mock_deps

    # Setup file
    mock_file = mocker.MagicMock()
    mock_file.original_filename = "large.pdf"
    mock_file.storage_key = "key_large"
    mock_file.is_deleted = False
    mock_file_repo.get_file_by_id.return_value = mock_file

    # Mock handler to return 10 images
    mock_handler = mocker.MagicMock()
    mock_handler.read_content.return_value = ["img"] * 10
    mock_get_handler.return_value = mock_handler

    # Test call
    result: list[Any] = await read_file.fn("ks123", "large.pdf", mode="image")
    # Verify
    assert isinstance(result, list), f"Expected list, got {type(result)}"
    assert len(result) == 6, f"Expected 6 items, got {len(result)}"  # 5 images + 1 warning text
    assert hasattr(result[5], "text"), "Last item missing 'text' attribute"
    assert result[5].text.startswith("\n\n[Warning:"), f"Text mismatch: {result[5].text}"


@pytest.mark.asyncio
async def test_read_file_under_limit(mock_deps: tuple[MagicMock, MagicMock], mocker: MockerFixture) -> None:
    """Test that reading a file with < 5 images returns all images without warning."""
    mock_file_repo, mock_get_handler = mock_deps

    # Setup file
    mock_file = mocker.MagicMock()
    mock_file.original_filename = "small.pdf"
    mock_file.storage_key = "key_small"
    mock_file.is_deleted = False
    mock_file_repo.get_file_by_id.return_value = mock_file

    # Mock handler to return 3 images
    mock_handler = mocker.MagicMock()
    mock_handler.read_content.return_value = ["img"] * 3
    mock_get_handler.return_value = mock_handler

    # Test call
    result: list[Any] = await read_file.fn("ks123", "small.pdf", mode="image")
    # Verify
    assert isinstance(result, list)
    assert len(result) == 3
    # Ensure no warning text object was appended (last item should be "img" string/object)
    assert result[-1] == "img"


@pytest.mark.asyncio
async def test_read_file_text_mode(mock_deps: tuple[MagicMock, MagicMock], mocker: MockerFixture) -> None:
    """Test that reading a file in text mode returns the standard dict response."""
    mock_file_repo, mock_get_handler = mock_deps

    # Setup file
    mock_file = mocker.MagicMock()
    mock_file.original_filename = "doc.txt"
    mock_file.storage_key = "key_text"
    mock_file.is_deleted = False
    mock_file.file_size = 100
    mock_file_repo.get_file_by_id.return_value = mock_file

    # Mock handler to return string
    mock_handler = mocker.MagicMock()
    mock_handler.read_content.return_value = "Hello World"
    mock_get_handler.return_value = mock_handler

    # Test call
    result: dict[str, Any] = await read_file.fn("ks123", "doc.txt", mode="text")  # type: ignore

    # Verify
    assert isinstance(result, dict)
    assert result["success"] is True
    assert result["content"] == "Hello World"
    assert result["filename"] == "doc.txt"
