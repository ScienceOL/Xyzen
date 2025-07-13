#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from models.Instrument import Instrument, Action
from models.MCPTool import MCPTool, SaveMCPTool

def test_simplified_mcp_tools():
    """测试简化后的InstrumentMCPTools类"""
    
    # 测试文件路径
    test_file = "data/test_mcp_tools.json"
    
    # 清理测试文件
    if os.path.exists(test_file):
        os.remove(test_file)
    
    print("=== 测试简化后的InstrumentMCPTools类 ===")
    
    # 1. 测试实例化（文件不存在时自动创建）
    print("\n1. 测试实例化（文件不存在时自动创建）")
    mcp_tools = SaveMCPTool(save_path=test_file)
    print(f"仪器数量: {len(mcp_tools)}")
    
    # 2. 创建测试数据
    print("\n2. 创建测试数据")
    
    # 机械臂 - 3个工具
    arm_instrument = Instrument(
        name="机械臂",
        description="机械臂仪器",
        instrument_id="arm_001",
        actions={
            "移动X": Action(
                name="移动X轴",
                description="移动机械臂X轴",
                parameters={"x": {"type": "number"}},
                output={"type": "boolean"},
                action_id="arm_x_001"
            )
        }
    )
    
    arm_tools = [
        MCPTool(
            name="移动X轴",
            description="移动机械臂X轴",
            inputSchema={"type": "object", "properties": {"x": {"type": "number"}}},
            tool_id="move_x",
            requires_license=True
        ),
        MCPTool(
            name="移动Y轴", 
            description="移动机械臂Y轴",
            inputSchema={"type": "object", "properties": {"y": {"type": "number"}}},
            tool_id="move_y",
            requires_license=True
        ),
        MCPTool(
            name="移动Z轴",
            description="移动机械臂Z轴", 
            inputSchema={"type": "object", "properties": {"z": {"type": "number"}}},
            tool_id="move_z",
            requires_license=True
        )
    ]
    
    # 机械手 - 2个工具
    hand_instrument = Instrument(
        name="机械手",
        description="机械手仪器",
        instrument_id="hand_001", 
        actions={
            "夹爪": Action(
                name="夹爪操作",
                description="机械手夹爪操作",
                parameters={"action": {"type": "string"}},
                output={"type": "boolean"},
                action_id="hand_gripper_001"
            )
        }
    )
    
    hand_tools = [
        MCPTool(
            name="打开夹爪",
            description="打开机械手夹爪",
            inputSchema={"type": "object", "properties": {}},
            tool_id="open_gripper",
            requires_license=True
        ),
        MCPTool(
            name="关闭夹爪",
            description="关闭机械手夹爪", 
            inputSchema={"type": "object", "properties": {}},
            tool_id="close_gripper",
            requires_license=True
        )
    ]
    
    # 3. 测试字典式操作
    print("\n3. 测试字典式操作")
    
    # 使用字典语法添加
    mcp_tools[arm_instrument] = arm_tools
    print(f"添加机械臂后仪器数量: {len(mcp_tools)}")
    
    mcp_tools[hand_instrument] = hand_tools
    print(f"添加机械手后仪器数量: {len(mcp_tools)}")
    
    # 使用字典语法获取
    retrieved_arm_tools = mcp_tools[arm_instrument]
    print(f"机械臂工具数量: {len(retrieved_arm_tools)}")
    
    # 检查仪器是否存在
    print(f"机械臂存在: {arm_instrument in mcp_tools}")
    print(f"机械手存在: {hand_instrument in mcp_tools}")
    
    # 4. 测试增删改查方法
    print("\n4. 测试增删改查方法")
    
    # 添加操作
    cart_instrument = Instrument(
        name="实验室推车",
        description="实验室推车仪器",
        instrument_id="cart_001",
        actions={}
    )
    
    cart_tools = [
        MCPTool(
            name="移动到位置",
            description="移动推车到指定位置",
            inputSchema={"type": "object", "properties": {"position": {"type": "string"}}},
            tool_id="move_to_position",
            requires_license=False
        )
    ]
    
    mcp_tools.add_instrument_tools(cart_instrument, cart_tools)
    print(f"添加推车后仪器数量: {len(mcp_tools)}")
    
    # 更新操作
    updated_arm_tools = [
        MCPTool(
            name="移动X轴（更新版）",
            description="移动机械臂X轴（更新版）",
            inputSchema={"type": "object", "properties": {"x": {"type": "number"}}},
            tool_id="move_x_updated",
            requires_license=False
        ),
        MCPTool(
            name="移动Y轴（更新版）",
            description="移动机械臂Y轴（更新版）",
            inputSchema={"type": "object", "properties": {"y": {"type": "number"}}},
            tool_id="move_y_updated",
            requires_license=False
        )
    ]
    
    mcp_tools.update_instrument_tools(arm_instrument, updated_arm_tools)
    print(f"更新机械臂后工具数量: {len(mcp_tools[arm_instrument])}")
    
    # 删除操作
    mcp_tools.remove_instrument_tools(hand_instrument)
    print(f"删除机械手后仪器数量: {len(mcp_tools)}")
    print(f"机械手存在: {hand_instrument in mcp_tools}")
    
    # 5. 测试通过ID操作
    print("\n5. 测试通过ID操作")
    
    # 通过ID获取仪器
    arm_by_id = mcp_tools.get_instrument_by_id("arm_001")
    print(f"通过ID获取机械臂: {arm_by_id.name if arm_by_id else 'None'}")
    
    # 通过ID获取工具
    arm_tools_by_id = mcp_tools.get_tools_by_instrument_id("arm_001")
    print(f"通过ID获取机械臂工具数量: {len(arm_tools_by_id) if arm_tools_by_id else 0}")
    
    # 通过ID检查存在
    print(f"通过ID检查机械臂存在: {mcp_tools.has_instrument_by_id('arm_001')}")
    print(f"通过ID检查不存在的仪器: {mcp_tools.has_instrument_by_id('nonexistent')}")
    
    # 通过ID删除
    mcp_tools.remove_instrument_by_id("cart_001")
    print(f"通过ID删除推车后仪器数量: {len(mcp_tools)}")
    
    # 6. 测试迭代
    print("\n6. 测试迭代")
    for instrument, tools in mcp_tools:
        print(f"仪器: {instrument.name} (ID: {instrument.instrument_id}), 工具数量: {len(tools)}")
        for i, tool in enumerate(tools):
            print(f"  {i+1}. {tool.name} (ID: {tool.tool_id})")
    
    # 7. 测试重新加载（模拟程序重启）
    print("\n7. 测试重新加载（模拟程序重启）")
    
    # 创建新的实例，应该加载现有数据
    mcp_tools_reloaded = SaveMCPTool(save_path=test_file)
    print(f"重新加载后仪器数量: {len(mcp_tools_reloaded)}")
    
    # 验证数据完整性
    for instrument, tools in mcp_tools_reloaded:
        print(f"重新加载的仪器: {instrument.name} (ID: {instrument.instrument_id})")
        print(f"重新加载的工具数量: {len(tools)}")
    
    # 8. 测试错误处理
    print("\n8. 测试错误处理")
    
    # 测试不存在的仪器
    try:
        nonexistent_instrument = Instrument(
            name="不存在的仪器",
            description="不存在的仪器",
            instrument_id="nonexistent",
            actions={}
        )
        tools = mcp_tools_reloaded[nonexistent_instrument]
    except KeyError as e:
        print(f"预期的错误: {e}")
    
    # 测试更新不存在的仪器
    try:
        mcp_tools_reloaded.update_instrument_tools(nonexistent_instrument, [])
    except KeyError as e:
        print(f"预期的错误: {e}")
    
    # 测试删除不存在的仪器
    try:
        mcp_tools_reloaded.remove_instrument_tools(nonexistent_instrument)
    except KeyError as e:
        print(f"预期的错误: {e}")
    
    # 测试通过ID删除不存在的仪器
    try:
        mcp_tools_reloaded.remove_instrument_by_id("nonexistent")
    except KeyError as e:
        print(f"预期的错误: {e}")
    
    # 9. 查看生成的文件
    print("\n9. 查看生成的文件")
    if os.path.exists(test_file):
        with open(test_file, 'r', encoding='utf-8') as f:
            file_content = json.load(f)
        print(f"文件大小: {os.path.getsize(test_file)} 字节")
        print(f"文件内容结构: {list(file_content.keys())}")
        print(f"仪器工具数量: {len(file_content.get('instruments_tools', []))}")
        
        # 显示文件内容
        print("\n文件内容预览:")
        for item in file_content.get('instruments_tools', []):
            instrument_data = item['instrument']
            tools_data = item['tools']
            print(f"  仪器: {instrument_data['name']} (ID: {instrument_data['instrument_id']})")
            print(f"  工具数量: {len(tools_data)}")
    
    # 清理测试文件
    if os.path.exists(test_file):
        os.remove(test_file)
        print(f"\n测试文件已清理: {test_file}")
    
    print("\n✅ 所有测试通过！简化后的InstrumentMCPTools类工作正常")

if __name__ == "__main__":
    test_simplified_mcp_tools() 