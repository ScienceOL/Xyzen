# Python官方库导入
from typing_extensions import Dict, List, Any, Optional, Union
import json
import os
# FastAPI导入
from fastapi import FastAPI, Request
# FastAPI_MCP导入
from fastapi_mcp import FastApiMCP
# MCP官方SDK导入
from mcp import types
# 本地导入
from models import MCPTool, Lab

class LabMCPServer(FastApiMCP):# 继承FastApiMCP类
    def __init__(self, fastapi: FastAPI):
        # 先加载数据，再调用父类初始化
        self.all_tools = self._load_all_tools_from_json()
        self.tool_name_to_id_map = self._create_tool_name_to_id_map()  # 工具名称到ID的映射
        self.lab_tools_map = self._load_lab_tools_map_from_json()
        self.labs = self._load_labs_from_json()  # 加载完整的Lab对象列表
        
        # 添加调试信息
        print(f"DEBUG: 初始化完成")
        print(f"DEBUG: 工具数量: {len(self.all_tools)}")
        print(f"DEBUG: 工具名称到ID映射: {self.tool_name_to_id_map}")
        print(f"DEBUG: 实验室权限映射: {self.lab_tools_map}")
        
        super().__init__(fastapi=fastapi)
        # 注册自定义的MCP回调
        self._register_custom_mcp_callbacks()
    
    def _load_all_tools_from_json(self) -> List[types.Tool]:
        """从mcp_tools.json加载所有工具"""
        try:
            with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
                data = json.load(f)
            
            tools = []
            for instrument_tools in data.get("instruments_tools", []):
                for tool_data in instrument_tools.get("tools", []):
                    # 创建标准的MCP Tool，只包含必需字段
                    tool = types.Tool(
                        name=tool_data["name"],
                        description=tool_data["description"],
                        inputSchema={
                            "type": "object",
                            "properties": tool_data.get("inputSchema", {})
                        }
                    )
                    tools.append(tool)
            
            return tools
        except Exception as e:
            print(f"加载工具失败: {e}")
            return []
    
    def _create_tool_name_to_id_map(self) -> Dict[str, str]:
        """创建工具名称到tool_id的映射"""
        try:
            with open("data/mcp_tools.json", "r", encoding="utf-8") as f:
                data = json.load(f)
            
            name_to_id_map = {}
            for instrument_tools in data.get("instruments_tools", []):
                for tool_data in instrument_tools.get("tools", []):
                    name_to_id_map[tool_data["name"]] = tool_data.get("tool_id")
            
            return name_to_id_map
        except Exception as e:
            print(f"创建工具名称映射失败: {e}")
            return {}
    
    def _load_lab_tools_map_from_json(self) -> Dict[str, List[str]]:
        """从labs.json加载实验室-工具权限映射"""
        try:
            # 如果labs.json为空或不存在，创建一个默认的映射
            if not os.path.exists("data/labs.json") or os.path.getsize("data/labs.json") == 0:
                # 默认所有实验室可以使用所有工具
                all_tool_ids = list(self.tool_name_to_id_map.values())
                default_labs = [
                    {
                        "name": "默认实验室1",
                        "description": "默认实验室",
                        "lab_id": 1,
                        "type": "Public",
                        "discipline": "Chemistry",
                        "mcp_tools_available": all_tool_ids
                    },
                    {
                        "name": "默认实验室2", 
                        "description": "默认实验室",
                        "lab_id": 2,
                        "type": "Private",
                        "discipline": "Biology",
                        "mcp_tools_available": all_tool_ids
                    }
                ]
                with open("data/labs.json", "w", encoding="utf-8") as f:
                    json.dump(default_labs, f, indent=2, ensure_ascii=False)
                return {f"lab_{lab['lab_id']}": lab['mcp_tools_available'] for lab in default_labs}
            
            with open("data/labs.json", "r", encoding="utf-8") as f:
                labs_data = json.load(f)
            
            # 将Lab对象数组转换为lab_id到工具列表的映射
            lab_tools_map = {}
            for lab_data in labs_data:
                lab_id = lab_data.get("lab_id")
                if lab_id is not None:
                    lab_tools_map[f"lab_{lab_id}"] = lab_data.get("mcp_tools_available", [])
            
            return lab_tools_map
        except Exception as e:
            print(f"加载实验室权限映射失败: {e}")
            return {}
    
    def _load_labs_from_json(self) -> List[Lab]:
        """从labs.json加载完整的Lab对象列表"""
        try:
            if not os.path.exists("data/labs.json") or os.path.getsize("data/labs.json") == 0:
                return []
            
            with open("data/labs.json", "r", encoding="utf-8") as f:
                labs_data = json.load(f)
            
            labs = []
            for lab_data in labs_data:
                try:
                    lab = Lab(**lab_data)
                    labs.append(lab)
                except Exception as e:
                    print(f"解析实验室数据失败: {e}, 数据: {lab_data}")
                    continue
            
            return labs
        except Exception as e:
            print(f"加载实验室数据失败: {e}")
            return []
    
    def _register_custom_mcp_callbacks(self):
        """注册自定义的MCP回调，覆盖父类的默认行为"""
        
        @self.server.list_tools()
        async def handle_list_tools(http_request_info: Optional[Any] = None) -> List[types.Tool]:
            # 直接返回所有工具
            return list(self.all_tools)
        
        @self.server.call_tool()
        async def handle_call_tool(
            name: str, 
            arguments: Dict[str, Any], 
            http_request_info: Optional[Any] = None
        ) -> List[Union[types.TextContent, types.ImageContent, types.EmbeddedResource]]:
            lab_id = self._extract_lab_id_from_request(http_request_info)
            if not lab_id:
                raise PermissionError("未指定实验室，无法调用工具")
            if not self._check_tool_permission(lab_id, name):
                raise PermissionError(f"实验室 {lab_id} 无权调用工具 {name}")
            return await self._execute_api_tool(
                client=self._http_client,
                tool_name=name,
                arguments=arguments,
                operation_map=self.operation_map,
                http_request_info=http_request_info,
            )
    
    def _extract_lab_id_from_request(self, http_request_info: Optional[Any]) -> Optional[str]:
        """从请求信息中提取lab_id"""
        if http_request_info and hasattr(http_request_info, 'query_params'):
            return http_request_info.query_params.get("lab_id")
        return None
    
    def _check_tool_permission(self, lab_id: str, tool_name: str) -> bool:
        """检查实验室是否有权限调用指定工具"""
        allowed_tool_ids = self.lab_tools_map.get(lab_id, [])
        # 通过工具名称找到对应的tool_id
        tool_id = self.tool_name_to_id_map.get(tool_name)
        return tool_id in allowed_tool_ids if tool_id else False

