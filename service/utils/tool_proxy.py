#!/usr/bin/env python3
"""
Tool Proxy - 工具代理模块

为独立环境中的工具提供代理功能：
- 在主进程中创建工具代理
- 通过子进程执行实际的工具调用
- 处理参数序列化和结果反序列化
"""

import json
import logging
from typing import Any, Dict, List, Optional

from llm_sandbox import SandboxBackend, SandboxSession  # type: ignore
from llm_sandbox.exceptions import SandboxTimeoutError  # type: ignore
from llm_sandbox.security import (  # type: ignore
    SecurityIssueSeverity,
    SecurityPattern,
    SecurityPolicy,
)

from internal import configs

logger = logging.getLogger(__name__)
policy = SecurityPolicy(
    severity_threshold=SecurityIssueSeverity.MEDIUM,
    patterns=[
        SecurityPattern(
            pattern=r"os\.system",
            description="System command execution",
            severity=SecurityIssueSeverity.HIGH,
        ),
        SecurityPattern(
            pattern=r"eval\s*\(",
            description="Dynamic code evaluation",
            severity=SecurityIssueSeverity.MEDIUM,
        ),
    ],
)
dynamic_mcp_config = configs.DynamicMCP


class ContainerToolProxy:
    """容器工具代理类"""

    def __init__(
        self,
        tool_data: Dict[str, Any],
        code_content: str,
        requirements: Optional[list[str]] = None,
    ) -> None:
        self.tool_data = tool_data  # FunctionTool序列化数据
        self.code_content = code_content  # 从数据库获取的原始代码
        self.requirements = requirements or []  # 依赖库列表
        self.tool_name = tool_data["name"]

        # 从tool_data中获取function_name
        if "function_name" in tool_data:
            self.function_name = tool_data["function_name"]
        else:
            self.function_name = tool_data["name"].split(".")[-1]

    def _build_execution_code(self, args: tuple, kwargs: dict) -> str:
        """Build the execution code for container execution."""
        return f"""
{self.code_content}

# Execute the specified function
import sys
import json
import traceback

def serialize_result(obj):
    '''Serialize result, handling non-serializable objects'''
    try:
        json.dumps(obj, ensure_ascii=False)
        return obj
    except (TypeError, ValueError):
        return str(obj)

try:
    # Call target function
    result = {self.function_name}(*{args}, **{kwargs})

    # Serialize result
    serialized_result = serialize_result(result)

    # Output JSON result
    print(json.dumps({{
        "success": True,
        "result": serialized_result
    }}, ensure_ascii=False))

except Exception as e:
    # Output error information
    print(json.dumps({{
        "success": False,
        "error": str(e),
        "traceback": traceback.format_exc()
    }}, ensure_ascii=False))
"""

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """代理函数调用 - 使用 llm-sandbox 在容器中直接执行代码"""
        try:
            logger.debug(f"Executing tool {self.tool_name} in container")
            logger.debug(f"Function: {self.function_name}, Args: {args}, Kwargs: {kwargs}")
            logger.debug(f"Requirements: {self.requirements}")

            # Build execution code: original code + function call + result serialization
            execution_code = self._build_execution_code(args, kwargs)

            if configs.Env == "prod":
                from kubernetes import client as k8s_client  # type: ignore
                from kubernetes import config as k8s_config

                k8s_config.load_incluster_config()
                k8s_api = k8s_client.CoreV1Api()
                session_kwargs = {
                    "backend": SandboxBackend.KUBERNETES,
                    "lang": "python",
                    "kube_namespace": configs.DynamicMCP.kubeNamespace,
                    "libraries": self.requirements,
                    "security_policy": policy,
                    "in_cluster": True,
                    "client": k8s_api,
                }
            else:
                session_kwargs = {
                    "backend": SandboxBackend.DOCKER,
                    "lang": "python",
                    "libraries": self.requirements,
                    "keep_template": True,
                    "runtime_configs": {
                        "cpu_count": dynamic_mcp_config.cpu_count,
                        "mem_limit": dynamic_mcp_config.mem_limit,
                    },
                    "default_timeout": dynamic_mcp_config.default_timeout,
                    "security_policy": policy,
                }

            # 使用 llm-sandbox 执行
            with SandboxSession(**session_kwargs) as session:
                is_safe, violations = session.is_safe(execution_code)

                if is_safe:
                    result = session.run(execution_code)

                    # 解析结果
                    if result.exit_code != 0:
                        error_msg = result.stderr or "Unknown container execution error"
                        raise RuntimeError(f"Container execution failed: {error_msg}")

                    # 解析JSON输出
                    try:
                        output = json.loads(result.stdout)
                    except json.JSONDecodeError as e:
                        raise RuntimeError(f"Failed to parse container output: {e}\nOutput: {result.stdout}")

                    # 检查工具执行结果
                    if output.get("success"):
                        result = output["result"]
                        # Wrap non-dict results according to MCP protocol requirements
                        if not isinstance(result, dict):
                            return {"result": result}
                        return result
                    else:
                        error_msg = output.get("error", "Unknown tool execution error")
                        traceback_msg = output.get("traceback", "")
                        raise RuntimeError(f"Tool execution error: {error_msg}\n{traceback_msg}")
                else:
                    logger.error(f"Tool {self.tool_name} is not safe")
                    for violation in violations:
                        logger.error(f"Violation: {violation.description}")
                    raise RuntimeError(f"Tool {self.tool_name} is not safe")

        except SandboxTimeoutError as e:
            logger.error(f"Container tool execution timed out for {self.tool_name}: {e}")
            raise RuntimeError(f"Container tool execution timed out for {self.tool_name}: {e}")

        except Exception as e:
            logger.error(f"Container tool execution failed for {self.tool_name}: {e}")
            raise


class ToolProxyManager:
    """工具代理管理器"""

    def __init__(self) -> None:
        self.proxies: Dict[str, ContainerToolProxy] = {}

    def create_proxy(
        self,
        tool_data: Dict[str, Any],
        code_content: str,
        requirements: Optional[list[str]] = None,
    ) -> ContainerToolProxy:
        """创建工具代理"""
        tool_name = tool_data["name"]
        proxy = ContainerToolProxy(tool_data, code_content, requirements)
        self.proxies[tool_name] = proxy
        return proxy

    def get_proxy(self, tool_name: str) -> ContainerToolProxy:
        """获取工具代理"""
        if tool_name not in self.proxies:
            raise KeyError(f"Tool proxy {tool_name} not found")
        return self.proxies[tool_name]

    def remove_proxy(self, tool_name: str) -> bool:
        """移除工具代理"""
        removed = False
        if tool_name in self.proxies:
            del self.proxies[tool_name]
            removed = True
        return removed

    def list_proxies(self) -> List[str]:
        """列出所有代理工具"""
        return list(self.proxies.keys())

    def clear_proxies(self) -> None:
        """清除所有代理"""
        self.proxies.clear()
