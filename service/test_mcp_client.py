#!/usr/bin/env python3
"""
用于测试MCP Lab工具的客户端脚本，使用FastMCP官方客户端。

在使用前，请确保FastAPI MCP服务已通过运行 'python -m cmd.main' 启动。
服务通常在 http://127.0.0.1:48200 上运行。
"""

import asyncio
import logging
from pathlib import Path
import sys
import json # Added missing import
from typing import Optional # Added missing import

# 添加项目路径，以便可以导入internal.configs
project_root = Path(__file__).resolve().parents[1] # Assumes script is in service/
sys.path.insert(0, str(project_root))

from fastmcp import Client
from internal import configs

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MCP 服务的基础URL
# 请确保你的FastAPI服务正在运行在 configs.SERVER.Host 和 configs.SERVER.Port 上
MCP_SERVER_URL = f"http://{configs.SERVER.Host}:{configs.SERVER.Port}/mcp/lab/"

async def call_mcp_tool_async(client: Client, tool_name: str, arguments: Optional[dict] = None) -> dict:
    """
    使用FastMCP客户端异步调用工具。
    """
    if arguments is None:
        arguments = {}

    logger.info(f"Calling MCP tool: {tool_name} with arguments: {arguments}")
    
    try:
        result = await client.call_tool(tool_name, arguments)
        logger.info(f"Raw Result from {tool_name}: {result}")
        
        # FastMCP客户端返回的result可能是各种类型，这里需要根据实际情况处理
        # 如果是TextContent，尝试解析其text字段
        if hasattr(result, 'data') and isinstance(result.data, list) and len(result.data) > 0 and hasattr(result.data[0], 'text'):
            try:
                # 尝试解析为JSON，如果不是，则直接返回原始文本
                return {"success": True, "data": json.loads(result.data[0].text)}
            except json.JSONDecodeError:
                return {"success": True, "raw_text": result.data[0].text}
        elif hasattr(result, 'data'): # For other structured data from fastmcp
            return {"success": True, "data": result.data}
        else: # For simple return types or errors directly from call_tool
            return {"success": True, "data": result} # Assuming simple types are directly the result

    except Exception as e:
        error_msg = f"Error calling MCP tool {tool_name}: {e}"
        logger.error(error_msg)
        return {"success": False, "error": error_msg}

async def test_all_mcp_tools():
    client = Client(MCP_SERVER_URL) # Connect to the Streamable HTTP endpoint
    
    async with client:
        print("\n--- Testing list_laboratory_devices ---")
        list_devices_result = await call_mcp_tool_async(client, "list_laboratory_devices")
        print(f"Test Result: {list_devices_result}")
        
        print("\n--- Testing list_device_actions ---")
        # 假设你的lab API中有一个名为 'bioyond1' 的设备
        list_actions_result = await call_mcp_tool_async(client, "list_device_actions", {"device_id": "bioyond1"})
        print(f"Test Result: {list_actions_result}")
        
        print("\n--- Testing perform_device_action ---")
        # 这是一个POST请求，需要提供action_type, action, command
        # 示例数据来自lab.rest
        perform_action_result = await call_mcp_tool_async(client, "perform_device_action", {
            "device_id": "bioyond1",
            "action_type": "unilabos_msgs.action._send_cmd.SendCmd",
            "action": "command",
            "command": "start"
        })
        print(f"Test Result: {perform_action_result}")
        
        print("\n--- Testing get_device_status ---")
        get_status_result = await call_mcp_tool_async(client, "get_device_status", {"device_id": "bioyond1"})
        print(f"Test Result: {get_status_result}")

if __name__ == "__main__":
    asyncio.run(test_all_mcp_tools()) 