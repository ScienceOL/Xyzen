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
import os
from typing import Any, Dict, List, Optional

from llm_sandbox import SandboxSession  # type: ignore

logger = logging.getLogger(__name__)


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

        # 获取容器执行超时时间
        self.timeout = int(os.environ.get("CONTAINER_TIMEOUT", "60"))

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

            # 使用 llm-sandbox 执行
            with SandboxSession(lang="python", libraries=self.requirements) as session:
                result = session.run(execution_code, timeout=self.timeout)

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
                    return output["result"]
                else:
                    error_msg = output.get("error", "Unknown tool execution error")
                    traceback_msg = output.get("traceback", "")
                    raise RuntimeError(f"Tool execution error: {error_msg}\n{traceback_msg}")

        except Exception as e:
            logger.error(f"Container tool execution failed for {self.tool_name}: {e}")
            raise


class ToolProxyManager:
    """工具代理管理器"""

    def __init__(self) -> None:
        self.proxies: Dict[str, ContainerToolProxy] = {}

    def create_proxy(
        self, tool_data: Dict[str, Any], tool_dir: str, requirements: Optional[list[str]] = None
    ) -> ContainerToolProxy:
        """创建工具代理"""
        tool_name = tool_data["name"]
        proxy = ContainerToolProxy(tool_data, tool_dir, requirements)
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
