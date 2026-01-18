"""Tests for SandboxExecutor."""

import pytest

from app.sandbox.executor import SandboxExecutor, ExecutionCache, get_execution_cache
from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.result import SandboxResult


class TestExecutionCache:
    """Tests for ExecutionCache."""

    def test_cache_miss(self) -> None:
        """Test cache returns None on miss."""
        cache = ExecutionCache(ttl_secs=300)
        result = cache.get("print('hello')", "python", "")
        assert result is None

    def test_cache_hit(self) -> None:
        """Test cache returns result on hit."""
        cache = ExecutionCache(ttl_secs=300)
        expected = SandboxResult(output=b"hello\n", exit_code=0)
        cache.set("print('hello')", "python", "", expected)
        result = cache.get("print('hello')", "python", "")
        assert result is not None
        assert result.output == expected.output

    def test_cache_key_uniqueness(self) -> None:
        """Test different inputs produce different cache keys."""
        cache = ExecutionCache(ttl_secs=300)
        result1 = SandboxResult(output=b"1")
        result2 = SandboxResult(output=b"2")
        cache.set("code1", "python", "", result1)
        cache.set("code2", "python", "", result2)
        assert cache.get("code1", "python", "") is not None
        assert cache.get("code2", "python", "") is not None
        assert cache.get("code1", "python", "").output == b"1"
        assert cache.get("code2", "python", "").output == b"2"

    def test_cache_clear(self) -> None:
        """Test cache clear removes all entries."""
        cache = ExecutionCache(ttl_secs=300)
        cache.set("code", "python", "", SandboxResult())
        cache.clear()
        assert cache.get("code", "python", "") is None


class TestSandboxExecutor:
    """Tests for SandboxExecutor."""

    def test_default_initialization(self) -> None:
        """Test default executor initialization."""
        executor = SandboxExecutor()
        assert executor.backend_type == "subprocess"
        assert executor.enable_cache is True
        assert isinstance(executor.limits, ResourceLimits)

    def test_custom_backend(self) -> None:
        """Test executor with custom backend."""
        executor = SandboxExecutor(backend="docker")
        assert executor.backend_type == "docker"

    def test_custom_limits(self) -> None:
        """Test executor with custom limits."""
        limits = ResourceLimits(memory_bytes=100 * 1024 * 1024)
        executor = SandboxExecutor(limits=limits)
        assert executor.limits.memory_bytes == 100 * 1024 * 1024

    def test_with_limits_method(self) -> None:
        """Test with_limits method for chaining."""
        executor = SandboxExecutor()
        limits = ResourceLimits(cpu_time_ms=1000)
        result = executor.with_limits(limits)
        assert result is executor
        assert executor.limits.cpu_time_ms == 1000

    def test_with_env_method(self) -> None:
        """Test with_env method for chaining."""
        executor = SandboxExecutor()
        result = executor.with_env("MY_VAR", "my_value")
        assert result is executor
        assert executor.env_vars["MY_VAR"] == "my_value"

    def test_add_library_method(self) -> None:
        """Test add_library method for chaining."""
        executor = SandboxExecutor()
        result = executor.add_library("numpy")
        assert result is executor
        assert "numpy" in executor.libraries

    def test_add_library_no_duplicates(self) -> None:
        """Test add_library doesn't add duplicates."""
        executor = SandboxExecutor()
        executor.add_library("numpy")
        executor.add_library("numpy")
        assert executor.libraries.count("numpy") == 1


@pytest.mark.asyncio
class TestSandboxExecutorAsync:
    """Async tests for SandboxExecutor."""

    async def test_execute_simple_python(self) -> None:
        """Test executing simple Python code."""
        async with SandboxExecutor() as executor:
            result = await executor.execute("print('hello')", language="python")
            assert result.exit_code == 0
            assert "hello" in result.output_str

    async def test_execute_with_error(self) -> None:
        """Test executing code that raises an error."""
        async with SandboxExecutor() as executor:
            result = await executor.execute("raise ValueError('test')", language="python")
            assert result.exit_code != 0
            assert result.success is False

    async def test_execute_with_stdin(self) -> None:
        """Test executing code with stdin."""
        code = "import sys; print(sys.stdin.read().strip())"
        async with SandboxExecutor() as executor:
            result = await executor.execute(code, language="python", stdin="hello")
            assert "hello" in result.output_str

    async def test_execute_python_convenience(self) -> None:
        """Test execute_python convenience method."""
        async with SandboxExecutor() as executor:
            result = await executor.execute_python("print(1 + 1)")
            assert "2" in result.output_str

    async def test_context_manager(self) -> None:
        """Test executor works as async context manager."""
        async with SandboxExecutor() as executor:
            assert executor is not None
            result = await executor.execute("print('test')")
            assert result.success

    async def test_execute_with_function(self) -> None:
        """Test execute_with_function method."""
        code = """
def add(a, b):
    return a + b
"""
        async with SandboxExecutor() as executor:
            result = await executor.execute_with_function(
                code=code,
                function_name="add",
                args=(1, 2),
            )
            assert result.success
            assert "3" in result.output_str

