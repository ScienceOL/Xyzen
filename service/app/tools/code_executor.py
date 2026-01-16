"""
Code Executor Tool

Provides secure code execution capabilities as a LangChain tool.
Uses the sandbox module for isolated execution.
"""

import json
import logging
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.sandbox import SandboxExecutor, ResourceLimits

logger = logging.getLogger(__name__)


class CodeExecuteInput(BaseModel):
    """Input schema for code execution."""

    code: str = Field(description="The code to execute")
    language: str = Field(
        default="python",
        description="Programming language: python, javascript, bash",
    )
    stdin: str = Field(
        default="",
        description="Standard input to provide to the code",
    )
    timeout_secs: int | None = Field(
        default=None,
        description="Execution timeout in seconds (default: 30)",
    )


class FunctionCallInput(BaseModel):
    """Input schema for function call execution."""

    code: str = Field(description="The code containing the function definition")
    function_name: str = Field(description="Name of the function to call")
    args: list[Any] = Field(
        default_factory=list,
        description="Positional arguments for the function",
    )
    kwargs: dict[str, Any] = Field(
        default_factory=dict,
        description="Keyword arguments for the function",
    )


async def _execute_code(
    code: str,
    language: str = "python",
    stdin: str = "",
    timeout_secs: int | None = None,
) -> dict[str, Any]:
    """Execute code in a sandbox and return the result."""
    logger.info(f"Executing {language} code in sandbox")

    # Create executor with optional custom timeout
    limits = ResourceLimits.from_config()
    if timeout_secs:
        limits.wall_time_ms = timeout_secs * 1000

    async with SandboxExecutor(limits=limits) as executor:
        result = await executor.execute(code, language, stdin)

    return {
        "success": result.success,
        "output": result.output_str,
        "stderr": result.stderr_str if result.stderr else None,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "error": result.error,
    }


async def _execute_function(
    code: str,
    function_name: str,
    args: list[Any] | None = None,
    kwargs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a function from code with given arguments."""
    logger.info(f"Executing function {function_name} in sandbox")

    args = args or []
    kwargs = kwargs or {}

    async with SandboxExecutor() as executor:
        result = await executor.execute_with_function(
            code=code,
            function_name=function_name,
            args=tuple(args),
            kwargs_dict=kwargs,
        )

    if not result.success:
        return {
            "success": False,
            "error": result.error or result.stderr_str,
        }

    # Parse the JSON output from the wrapper
    try:
        output = json.loads(result.output_str.strip())
        return output
    except json.JSONDecodeError:
        return {
            "success": True,
            "result": result.output_str,
        }


def create_code_executor_tools() -> list[StructuredTool]:
    """Create code executor tools for agent use."""
    tools: list[StructuredTool] = []

    # Code execution tool
    tools.append(
        StructuredTool(
            name="execute_code",
            description=(
                "Execute code in a secure sandbox environment. "
                "Supports Python, JavaScript, and Bash. "
                "The code runs in isolation with resource limits. "
                "Returns the output, exit code, and any errors."
            ),
            args_schema=CodeExecuteInput,
            coroutine=_execute_code,
        )
    )

    # Function call tool
    tools.append(
        StructuredTool(
            name="execute_function",
            description=(
                "Execute a specific function from code with given arguments. "
                "Provide the code containing the function definition, "
                "the function name, and the arguments to pass. "
                "Returns the function's return value."
            ),
            args_schema=FunctionCallInput,
            coroutine=_execute_function,
        )
    )

    return tools


def register_code_executor_tools() -> None:
    """Register code executor tools with the builtin tool registry."""
    from app.tools.registry import BuiltinToolRegistry

    tools = create_code_executor_tools()
    for tool in tools:
        BuiltinToolRegistry.register(
            tool_id=tool.name,
            tool=tool,
            category="code_execution",
            display_name=tool.name.replace("_", " ").title(),
        )
    logger.info(f"Registered {len(tools)} code executor tools")
