"""
Container Sandbox Backend

Executes code in Docker or Kubernetes containers.
Integrates with the existing llm-sandbox library.
"""

import logging
import time
from typing import Any

from llm_sandbox import SandboxBackend, SandboxSession
from llm_sandbox.exceptions import SandboxTimeoutError
from llm_sandbox.security import (
    SecurityIssueSeverity,
    SecurityPattern,
    SecurityPolicy,
)

from app.configs import configs
from app.sandbox.backends.base import BaseSandboxBackend
from app.sandbox.resource_limits import ResourceLimits
from app.sandbox.result import SandboxResult

logger = logging.getLogger(__name__)


# Default security policy
DEFAULT_SECURITY_POLICY = SecurityPolicy(
    severity_threshold=SecurityIssueSeverity.MEDIUM,
    patterns=[
        SecurityPattern(
            pattern=r"os\.system",
            description="System command execution",
            severity=SecurityIssueSeverity.HIGH,
        ),
        SecurityPattern(
            pattern=r"subprocess\.(run|call|Popen)",
            description="Subprocess execution",
            severity=SecurityIssueSeverity.HIGH,
        ),
        SecurityPattern(
            pattern=r"eval\s*\(",
            description="Dynamic code evaluation",
            severity=SecurityIssueSeverity.MEDIUM,
        ),
        SecurityPattern(
            pattern=r"exec\s*\(",
            description="Dynamic code execution",
            severity=SecurityIssueSeverity.MEDIUM,
        ),
        SecurityPattern(
            pattern=r"__import__",
            description="Dynamic import",
            severity=SecurityIssueSeverity.MEDIUM,
        ),
    ],
)


class ContainerBackend(BaseSandboxBackend):
    """Container-based sandbox backend using llm-sandbox."""

    def __init__(
        self,
        limits: ResourceLimits | None = None,
        env_vars: dict[str, str] | None = None,
        allowed_paths: list[str] | None = None,
        backend: str = "docker",
        libraries: list[str] | None = None,
        security_policy: SecurityPolicy | None = None,
    ) -> None:
        super().__init__(limits, env_vars, allowed_paths)
        self.backend_type = backend.lower()
        self.libraries = libraries or []
        self.security_policy = security_policy or DEFAULT_SECURITY_POLICY
        self._session: SandboxSession | None = None

    def _get_sandbox_backend(self) -> SandboxBackend:
        """Get the llm-sandbox backend enum."""
        if self.backend_type == "kubernetes" or self.backend_type == "k8s":
            return SandboxBackend.KUBERNETES
        return SandboxBackend.DOCKER

    def _build_session_kwargs(self) -> dict[str, Any]:
        """Build kwargs for SandboxSession."""
        sandbox_config = getattr(configs, "Sandbox", None)
        dynamic_mcp_config = configs.DynamicMCP

        if configs.Env == "prod" and self.backend_type in ("kubernetes", "k8s"):
            from kubernetes import client as k8s_client
            from kubernetes import config as k8s_config

            k8s_config.load_incluster_config()
            k8s_api = k8s_client.CoreV1Api()

            return {
                "backend": SandboxBackend.KUBERNETES,
                "lang": "python",
                "kube_namespace": (
                    sandbox_config.kube_namespace
                    if sandbox_config
                    else dynamic_mcp_config.kubeNamespace
                ),
                "libraries": self.libraries,
                "security_policy": self.security_policy,
                "in_cluster": True,
                "client": k8s_api,
            }

        return {
            "backend": SandboxBackend.DOCKER,
            "lang": "python",
            "libraries": self.libraries,
            "keep_template": True,
            "runtime_configs": {
                "cpu_count": dynamic_mcp_config.cpu_count,
                "mem_limit": dynamic_mcp_config.mem_limit,
            },
            "default_timeout": self.limits.wall_time_ms // 1000,
            "security_policy": self.security_policy,
        }

    async def execute(
        self,
        code: str,
        language: str = "python",
        stdin: str = "",
        **kwargs: Any,
    ) -> SandboxResult:
        """Execute code in a container."""
        logger.info(f"Executing {language} code in container sandbox")
        start_time = time.time()

        session_kwargs = self._build_session_kwargs()
        session_kwargs["lang"] = language

        try:
            with SandboxSession(**session_kwargs) as session:
                # Security check
                is_safe, violations = session.is_safe(code)
                if not is_safe:
                    violation_msgs = [v.description for v in violations]
                    logger.warning(f"Code failed security check: {violation_msgs}")
                    return SandboxResult.from_error(
                        f"Security violation: {', '.join(violation_msgs)}"
                    )

                # Execute code
                result = session.run(code)
                duration_ms = int((time.time() - start_time) * 1000)

                if result.exit_code != 0:
                    return SandboxResult(
                        output=result.stdout.encode() if result.stdout else b"",
                        stderr=result.stderr.encode() if result.stderr else b"",
                        exit_code=result.exit_code,
                        duration_ms=duration_ms,
                        error=result.stderr or "Container execution failed",
                    )

                return SandboxResult(
                    output=result.stdout.encode() if result.stdout else b"",
                    stderr=result.stderr.encode() if result.stderr else b"",
                    exit_code=0,
                    duration_ms=duration_ms,
                )
        except SandboxTimeoutError:
            duration_ms = int((time.time() - start_time) * 1000)
            return SandboxResult.from_timeout(duration_ms)
        except Exception as e:
            logger.error(f"Container execution failed: {e}")
            return SandboxResult.from_error(str(e))

    async def execute_file(
        self,
        file_path: str,
        stdin: str = "",
        language: str = "python",
        **kwargs: Any,
    ) -> SandboxResult:
        """Execute a file in a container."""
        # Read file content and execute
        try:
            with open(file_path, encoding="utf-8") as f:
                code = f.read()
            return await self.execute(code, language, stdin, **kwargs)
        except FileNotFoundError:
            return SandboxResult.from_error(f"File not found: {file_path}")
        except Exception as e:
            return SandboxResult.from_error(f"Failed to read file: {e}")

    def add_library(self, library: str) -> "ContainerBackend":
        """Add a library to install in the container."""
        if library not in self.libraries:
            self.libraries.append(library)
        return self

    def set_security_policy(self, policy: SecurityPolicy) -> "ContainerBackend":
        """Set the security policy."""
        self.security_policy = policy
        return self

    async def cleanup(self) -> None:
        """Clean up container resources."""
        # llm-sandbox handles cleanup via context manager
        pass
