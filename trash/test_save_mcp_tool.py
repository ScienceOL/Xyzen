#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试SaveMCPTool的序列化和反序列化功能
"""

from models import SaveMCPTool, Instrument, Action, MCPTool

def test_save_mcp_tool():
    """测试SaveMCPTool的基本功能"""
    print("=== 测试SaveMCPTool基本功能 ===")
    
    # 创建测试数据
    action1 = Action(name="test_action1", description="测试动作1", parameters={})
    action2 = Action(name="test_action2", description="测试动作2", parameters={})
    
    instrument = Instrument(
        name="test_instrument",
        description="测试仪器",
        actions={"action1": action1, "action2": action2}
    )
    
    mcp_tool1 = MCPTool(
        name="test_action1",
        description="测试动作1",
        inputSchema={},
        tid="test_instrument&action1"
    )
    
    mcp_tool2 = MCPTool(
        name="test_action2", 
        description="测试动作2",
        inputSchema={},
        tid="test_instrument&action2"
    )
    
    # 创建SaveMCPTool对象
    save_mcp_tool = SaveMCPTool(instrument=instrument, tools=[mcp_tool1, mcp_tool2])
    
    print(f"创建成功: 仪器={save_mcp_tool.instrument.name}, 工具数量={len(save_mcp_tool.tools)}")
    
    # 测试to_dict方法
    try:
        data_dict = save_mcp_tool.to_dict()
        print("to_dict() 成功")
        print(f"数据: {data_dict}")
    except Exception as e:
        print(f"to_dict() 失败: {e}")
        return
    
    # 测试from_dict方法
    try:
        new_save_mcp_tool = SaveMCPTool.from_dict(data_dict)
        print("from_dict() 成功")
        print(f"恢复的仪器: {new_save_mcp_tool.instrument.name}")
        print(f"恢复的工具数量: {len(new_save_mcp_tool.tools)}")
    except Exception as e:
        print(f"from_dict() 失败: {e}")
        return
    
    print("所有测试通过！")

if __name__ == "__main__":
    test_save_mcp_tool() 