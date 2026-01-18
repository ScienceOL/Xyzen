"""
Sandbox API Handlers.

This module provides the following endpoints for code execution:
- POST /execute: Execute code in a sandbox
- POST /execute-function: Execute a function with arguments
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.sandbox import SandboxExecutor, ResourceLimits

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sandbox"])


class ExecuteCodeRequest(BaseModel):
    """Request to execute code in sandbox."""

    code: str = Field(..., description="The code to execute")
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
        description="Execution timeout in seconds (default: 30, max: 60)",
    )


class ExecuteFunctionRequest(BaseModel):
    """Request to execute a function with arguments."""

    code: str = Field(..., description="The code containing the function definition")
    function_name: str = Field(..., description="Name of the function to call")
    args: list[Any] = Field(
        default_factory=list,
        description="Positional arguments for the function",
    )
    kwargs: dict[str, Any] = Field(
        default_factory=dict,
        description="Keyword arguments for the function",
    )


class ExecuteResponse(BaseModel):
    """Response from code execution."""

    success: bool = Field(..., description="Whether execution was successful")
    output: str = Field(default="", description="Standard output from execution")
    stderr: str | None = Field(default=None, description="Standard error output")
    exit_code: int = Field(default=0, description="Exit code from execution")
    duration_ms: int = Field(default=0, description="Execution duration in milliseconds")
    error: str | None = Field(default=None, description="Error message if execution failed")


class FunctionResponse(BaseModel):
    """Response from function execution."""

    success: bool = Field(..., description="Whether execution was successful")
    result: Any = Field(default=None, description="Return value from the function")
    error: str | None = Field(default=None, description="Error message if execution failed")
    traceback: str | None = Field(default=None, description="Traceback if an exception occurred")


@router.post(
    "/execute",
    response_model=ExecuteResponse,
    summary="Execute code in sandbox",
    description="Execute code in a secure sandbox environment with resource limits.",
)
async def execute_code(
    request: ExecuteCodeRequest,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> ExecuteResponse:
    """Execute code in a sandbox."""
    logger.info(f"User {current_user} executing {request.language} code")

    # Validate timeout
    timeout_secs = request.timeout_secs
    if timeout_secs is not None:
        if timeout_secs < 1:
            raise HTTPException(status_code=400, detail="Timeout must be at least 1 second")
        if timeout_secs > 60:
            raise HTTPException(status_code=400, detail="Timeout cannot exceed 60 seconds")

    # Create executor with optional custom timeout
    limits = ResourceLimits.from_config()
    if timeout_secs:
        limits.wall_time_ms = timeout_secs * 1000

    try:
        async with SandboxExecutor(limits=limits) as executor:
            result = await executor.execute(
                code=request.code,
                language=request.language,
                stdin=request.stdin,
            )

        return ExecuteResponse(
            success=result.success,
            output=result.output_str,
            stderr=result.stderr_str if result.stderr else None,
            exit_code=result.exit_code,
            duration_ms=result.duration_ms,
            error=result.error,
        )
    except Exception as e:
        logger.error(f"Sandbox execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Execution failed: {e}")


@router.post(
    "/execute-function",
    response_model=FunctionResponse,
    summary="Execute a function with arguments",
    description="Execute a specific function from code with given arguments.",
)
async def execute_function(
    request: ExecuteFunctionRequest,
    session: AsyncSession = Depends(get_session),
    current_user: str = Depends(get_current_user),
) -> FunctionResponse:
    """Execute a function with arguments."""
    logger.info(f"User {current_user} executing function {request.function_name}")

    try:
        async with SandboxExecutor() as executor:
            result = await executor.execute_with_function(
                code=request.code,
                function_name=request.function_name,
                args=tuple(request.args),
                kwargs_dict=request.kwargs,
            )

        if not result.success:
            return FunctionResponse(
                success=False,
                error=result.error or result.stderr_str,
            )

        # Parse the JSON output from the wrapper
        import json

        try:
            output = json.loads(result.output_str.strip())
            return FunctionResponse(**output)
        except json.JSONDecodeError:
            return FunctionResponse(
                success=True,
                result=result.output_str,
            )
    except Exception as e:
        logger.error(f"Function execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Execution failed: {e}")
