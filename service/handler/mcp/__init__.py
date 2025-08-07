"""
MCP 服务器集合
"""

from .dify import dify_mcp
from .lab import lab_mcp
from .other import other_mcp

# 导出所有 MCP 服务器
__all__ = ["lab_mcp", "other_mcp", "dify_mcp"]

# 可选：创建服务器注册表
MCP_SERVERS = {
    "lab": {"server": lab_mcp, "mount_path": "/mcp/lab", "name": "Lab 🚀"},
    "other": {"server": other_mcp, "mount_path": "/mcp/other", "name": "Other Tools 🛠️"},
    "dify": {"server": dify_mcp, "mount_path": "/mcp/dify", "name": "Dify Workflows 🚀"},
}
