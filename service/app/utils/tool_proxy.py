#!/usr/bin/env python3
"""
Tool Proxy - 工具代理模块

为独立环境中的工具提供代理功能：
- 在主进程中创建工具代理
- 通过 E2B 沙箱执行实际的工具调用
- 处理参数序列化和结果反序列化
"""

import asyncio
import json
import logging
from typing import Any

from app.sandbox import E2BSandboxManager

logger = logging.getLogger(__name__)


class ContainerToolProxy:
    """容器工具代理类 - 使用 E2B 沙箱执行"""

    def __init__(
        self,
        tool_data: dict[str, Any],
        code_content: str,
        requirements: list[str] | None = None,
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

    def _build_execution_code(self, args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
        """Build the execution code for E2B sandbox execution."""
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

    async def _execute_async(self, *args: Any, **kwargs: Any) -> Any:
        """异步执行工具调用"""
        logger.debug(f"Executing tool {self.tool_name} in E2B sandbox")
        logger.debug(f"Function: {self.function_name}, Args: {args}, Kwargs: {kwargs}")
        logger.debug(f"Requirements: {self.requirements}")

        # 使用工具名称作为临时的 session_id
        # 每个工具调用使用独立的沙箱会话
        session_id = f"tool_proxy_{self.tool_name}_{id(self)}"

        manager = E2BSandboxManager.get_instance()

        try:
            # 如果有依赖库，先安装
            if self.requirements:
                logger.debug(f"Installing requirements: {self.requirements}")
                install_result = await manager.install(session_id, self.requirements)
                if not install_result.success:
                    raise RuntimeError(f"Failed to install requirements: {install_result.error}")

            # Build execution code
            execution_code = self._build_execution_code(args, kwargs)

            # 执行代码
            result = await manager.execute(session_id, execution_code)

            if not result.success:
                raise RuntimeError(f"Sandbox execution failed: {result.error}")

            # 解析JSON输出
            try:
                output = json.loads(result.output.strip())
            except json.JSONDecodeError as e:
                raise RuntimeError(f"Failed to parse sandbox output: {e}\nOutput: {result.output}")

            # 检查工具执行结果
            if output.get("success"):
                tool_result = output["result"]
                # Wrap non-dict results according to MCP protocol requirements
                if not isinstance(tool_result, dict):
                    return {"result": tool_result}
                return tool_result
            else:
                error_msg = output.get("error", "Unknown tool execution error")
                traceback_msg = output.get("traceback", "")
                raise RuntimeError(f"Tool execution error: {error_msg}\n{traceback_msg}")

        except Exception as e:
            logger.error(f"E2B sandbox tool execution failed for {self.tool_name}: {e}")
            raise

        finally:
            # 清理沙箱会话
            try:
                await manager.stop(session_id)
            except Exception as e:
                logger.warning(f"Failed to stop sandbox session {session_id}: {e}")

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """代理函数调用 - 使用 E2B 沙箱执行代码"""
        try:
            # 检查是否在事件循环中
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop is not None:
                # 已经在事件循环中，创建任务
                import concurrent.futures

                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(
                        asyncio.run,
                        self._execute_async(*args, **kwargs),
                    )
                    return future.result()
            else:
                # 不在事件循环中，直接运行
                return asyncio.run(self._execute_async(*args, **kwargs))

        except Exception as e:
            logger.error(f"Container tool execution failed for {self.tool_name}: {e}")
            raise


class ToolProxyManager:
    """工具代理管理器"""

    def __init__(self) -> None:
        self.proxies: dict[str, ContainerToolProxy] = {}

    def create_proxy(
        self,
        tool_data: dict[str, Any],
        code_content: str,
        requirements: list[str] | None = None,
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

    def list_proxies(self) -> list[str]:
        """列出所有代理工具"""
        return list(self.proxies.keys())

    def clear_proxies(self) -> None:
        """清除所有代理"""
        self.proxies.clear()
