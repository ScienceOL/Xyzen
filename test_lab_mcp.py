"""测试实验室MCP功能"""

import asyncio
from fastapi.testclient import TestClient
from main import app
from server.FastAPILabMCP import lab_mcp_manager
from data.labs import get_all_lab_ids

def test_lab_mcp_creation():
    """测试实验室MCP服务器的创建"""
    try:
        # 获取所有实验室ID
        lab_ids = get_all_lab_ids()
        print(f"找到实验室ID: {lab_ids}")
        
        # 为每个实验室创建MCP服务器
        for lid in lab_ids:
            try:
                lab_mcp = lab_mcp_manager.get_or_create_lab_mcp(lid, app)
                print(f"成功创建实验室 {lid} 的MCP服务器: {lab_mcp.name}")
                print(f"  - 描述: {lab_mcp.description}")
                print(f"  - 可用工具数量: {len(lab_mcp.tools)}")
                print(f"  - 工具列表: {[tool.name for tool in lab_mcp.tools]}")
                print("-" * 50)
            except Exception as e:
                print(f"创建实验室 {lid} 的MCP服务器失败: {e}")
                
    except Exception as e:
        print(f"测试失败: {e}")

def test_lab_mcp_endpoints():
    """测试实验室MCP端点"""
    client = TestClient(app)
    
    # 测试基本端点
    response = client.get("/")
    print(f"基本端点测试: {response.status_code}")
    
    # 测试实验室端点
    lab_ids = get_all_lab_ids()
    for lid in lab_ids:
        try:
            # 测试实验室信息
            response = client.get(f"/labs/{lid}")
            print(f"实验室 {lid} 信息: {response.status_code}")
            
            # 测试实验室工具列表
            response = client.get(f"/labs/{lid}/tools")
            print(f"实验室 {lid} 工具列表: {response.status_code}")
            
            # 测试MCP连接端点（这个可能需要特殊的客户端）
            # response = client.get(f"/labs/{lid}/tools/mcp")
            # print(f"实验室 {lid} MCP连接: {response.status_code}")
            
        except Exception as e:
            print(f"测试实验室 {lid} 端点失败: {e}")

if __name__ == "__main__":
    print("=== 测试实验室MCP服务器创建 ===")
    test_lab_mcp_creation()
    
    print("\n=== 测试实验室MCP端点 ===")
    test_lab_mcp_endpoints()
    
    print("\n=== 测试完成 ===") 