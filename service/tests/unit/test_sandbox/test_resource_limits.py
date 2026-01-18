"""Tests for ResourceLimits."""

import pytest

from app.sandbox.resource_limits import ResourceLimits


class TestResourceLimits:
    """Tests for ResourceLimits dataclass."""

    def test_default_values(self) -> None:
        """Test default resource limit values."""
        limits = ResourceLimits()
        assert limits.memory_bytes == 256 * 1024 * 1024  # 256MB
        assert limits.cpu_time_ms == 5000  # 5 seconds
        assert limits.wall_time_ms == 30 * 1000  # 30 seconds
        assert limits.max_threads == 4
        assert limits.max_file_size == 10 * 1024 * 1024  # 10MB
        assert limits.max_open_files == 10
        assert limits.max_fuel == 1_000_000_000

    def test_custom_values(self) -> None:
        """Test creating ResourceLimits with custom values."""
        limits = ResourceLimits(
            memory_bytes=512 * 1024 * 1024,
            cpu_time_ms=10000,
            wall_time_ms=60000,
            max_threads=8,
            max_file_size=20 * 1024 * 1024,
            max_open_files=20,
            max_fuel=2_000_000_000,
        )
        assert limits.memory_bytes == 512 * 1024 * 1024
        assert limits.cpu_time_ms == 10000
        assert limits.wall_time_ms == 60000
        assert limits.max_threads == 8
        assert limits.max_file_size == 20 * 1024 * 1024
        assert limits.max_open_files == 20
        assert limits.max_fuel == 2_000_000_000

    def test_to_dict(self) -> None:
        """Test converting ResourceLimits to dictionary."""
        limits = ResourceLimits()
        result = limits.to_dict()
        assert isinstance(result, dict)
        assert "memory_bytes" in result
        assert "cpu_time_ms" in result
        assert "wall_time_ms" in result
        assert "max_threads" in result
        assert "max_file_size" in result
        assert "max_open_files" in result
        assert "max_fuel" in result

    def test_validate_memory_usage_within_limit(self) -> None:
        """Test memory validation when within limit."""
        limits = ResourceLimits(memory_bytes=100)
        assert limits.validate_memory_usage(50) is True
        assert limits.validate_memory_usage(100) is True

    def test_validate_memory_usage_exceeds_limit(self) -> None:
        """Test memory validation when exceeding limit."""
        limits = ResourceLimits(memory_bytes=100)
        assert limits.validate_memory_usage(101) is False

    def test_validate_file_size_within_limit(self) -> None:
        """Test file size validation when within limit."""
        limits = ResourceLimits(max_file_size=100)
        assert limits.validate_file_size(50) is True
        assert limits.validate_file_size(100) is True

    def test_validate_file_size_exceeds_limit(self) -> None:
        """Test file size validation when exceeding limit."""
        limits = ResourceLimits(max_file_size=100)
        assert limits.validate_file_size(101) is False

    def test_from_config(self) -> None:
        """Test creating ResourceLimits from config."""
        limits = ResourceLimits.from_config()
        assert isinstance(limits, ResourceLimits)
        assert limits.memory_bytes > 0
        assert limits.cpu_time_ms > 0

    def test_default_method(self) -> None:
        """Test default() class method."""
        limits = ResourceLimits.default()
        assert isinstance(limits, ResourceLimits)

