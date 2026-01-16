"""
Sandbox Module

Provides secure code execution environments with resource limits.

Supported backends:
- subprocess: Local process with resource limits (Linux rlimit)
- docker: Docker container isolation
- kubernetes: Kubernetes pod isolation
- wasm: WebAssembly sandbox (future)
"""

from app.sandbox.executor import SandboxExecutor
from app.sandbox.result import SandboxResult
from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.backends.base import BaseSandboxBackend
from app.sandbox.backends.subprocess_backend import SubprocessBackend
from app.sandbox.backends.container_backend import ContainerBackend

__all__ = [
    "SandboxExecutor",
    "SandboxResult",
    "ResourceLimits",
    "BaseSandboxBackend",
    "SubprocessBackend",
    "ContainerBackend",
]

