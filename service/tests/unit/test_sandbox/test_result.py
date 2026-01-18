"""Tests for SandboxResult."""

import pytest

from app.sandbox.result import SandboxResult


class TestSandboxResult:
    """Tests for SandboxResult dataclass."""

    def test_default_values(self) -> None:
        """Test default result values."""
        result = SandboxResult()
        assert result.output == b""
        assert result.exit_code == 0
        assert result.cpu_time_used_ms == 0
        assert result.memory_used_bytes == 0
        assert result.error is None
        assert result.stderr == b""
        assert result.duration_ms == 0

    def test_success_property_on_success(self) -> None:
        """Test success property when execution succeeded."""
        result = SandboxResult(exit_code=0)
        assert result.success is True

    def test_success_property_on_failure(self) -> None:
        """Test success property when execution failed."""
        result = SandboxResult(exit_code=1)
        assert result.success is False

        result_with_error = SandboxResult(exit_code=0, error="Something went wrong")
        assert result_with_error.success is False

    def test_output_str_property(self) -> None:
        """Test output_str property converts bytes to string."""
        result = SandboxResult(output=b"Hello, World!")
        assert result.output_str == "Hello, World!"

    def test_output_str_handles_unicode(self) -> None:
        """Test output_str handles unicode properly."""
        result = SandboxResult(output="你好世界".encode("utf-8"))
        assert result.output_str == "你好世界"

    def test_stderr_str_property(self) -> None:
        """Test stderr_str property converts bytes to string."""
        result = SandboxResult(stderr=b"Error message")
        assert result.stderr_str == "Error message"

    def test_to_dict(self) -> None:
        """Test converting SandboxResult to dictionary."""
        result = SandboxResult(
            output=b"output",
            stderr=b"error",
            exit_code=0,
            duration_ms=100,
        )
        result_dict = result.to_dict()
        assert isinstance(result_dict, dict)
        assert result_dict["output"] == "output"
        assert result_dict["stderr"] == "error"
        assert result_dict["exit_code"] == 0
        assert result_dict["duration_ms"] == 100
        assert result_dict["success"] is True

    def test_from_error(self) -> None:
        """Test creating result from error."""
        result = SandboxResult.from_error("Test error", exit_code=2)
        assert result.exit_code == 2
        assert result.error == "Test error"
        assert result.success is False

    def test_from_error_default_exit_code(self) -> None:
        """Test from_error uses default exit code of 1."""
        result = SandboxResult.from_error("Test error")
        assert result.exit_code == 1

    def test_from_timeout(self) -> None:
        """Test creating result from timeout."""
        result = SandboxResult.from_timeout(5000)
        assert result.exit_code == -1
        assert "5000ms" in result.error
        assert result.duration_ms == 5000
        assert result.success is False

