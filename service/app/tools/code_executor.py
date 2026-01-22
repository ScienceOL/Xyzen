"""
代码执行工具

提供基于 E2B 沙箱的代码执行 LangChain 工具。
"""

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.sandbox import E2BSandboxManager

logger = logging.getLogger(__name__)


class CodeExecuteInput(BaseModel):
    """代码执行输入"""

    code: str = Field(description="要执行的 Python 代码")


class InstallPackageInput(BaseModel):
    """安装包输入"""

    packages: list[str] = Field(description="要安装的 pip 包列表")


def _get_session_id(config: RunnableConfig) -> str:
    """从 RunnableConfig 中获取 session_id"""
    configurable = config.get("configurable", {})
    session_id = configurable.get("session_id")
    if not session_id:
        raise ValueError("session_id not found in config.configurable")
    return session_id


async def _execute_code(code: str, config: RunnableConfig) -> dict[str, Any]:
    """执行代码"""
    session_id = _get_session_id(config)
    logger.info(f"Executing code in session {session_id}")

    manager = E2BSandboxManager.get_instance()
    result = await manager.execute(session_id, code)
    return result.model_dump()


async def _install_packages(packages: list[str], config: RunnableConfig) -> dict[str, Any]:
    """安装 pip 包"""
    session_id = _get_session_id(config)
    logger.info(f"Installing packages {packages} in session {session_id}")

    manager = E2BSandboxManager.get_instance()
    result = await manager.install(session_id, packages)
    return result.model_dump()


def create_code_executor_tools() -> list[StructuredTool]:
    """创建代码执行工具列表"""
    return [
        StructuredTool(
            name="execute_python",
            description=(
                "在沙箱中执行 Python 代码。"
                "支持数据分析、文件处理、图表生成等操作。"
                "执行环境会保持状态，变量和导入的模块在后续调用中仍然可用。"
            ),
            args_schema=CodeExecuteInput,
            coroutine=_execute_code,
        ),
        StructuredTool(
            name="install_packages",
            description=(
                "在沙箱中安装 Python 依赖包。"
                "使用 pip 安装指定的包。"
                "安装后的包在当前会话中可用。"
            ),
            args_schema=InstallPackageInput,
            coroutine=_install_packages,
        ),
    ]


def register_code_executor_tools() -> None:
    """注册代码执行工具到内置工具注册表"""
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
