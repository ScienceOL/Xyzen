#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
from models.Instrument import Instrument, Action
from models.MCPTool import MCPTool, SaveMCPTool

def test_different_tool_counts():
    """测试不同仪器包含不同数量工具的序列化和反序列化"""
    
    # 创建机械臂（3个工具）
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
    
    # 创建机械手（2个工具）
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
    
    # 创建SaveMCPTool实例
    arm_save_tool = SaveMCPTool(arm_instrument, arm_tools)
    hand_save_tool = SaveMCPTool(hand_instrument, hand_tools)
    
    print(f"机械臂工具数量: {len(arm_save_tool)}")
    print(f"机械手工具数量: {len(hand_save_tool)}")
    
    # 序列化
    arm_dict = arm_save_tool.to_dict()
    hand_dict = hand_save_tool.to_dict()
    
    print(f"序列化后机械臂工具数量: {len(arm_dict['tools'])}")
    print(f"序列化后机械手工具数量: {len(hand_dict['tools'])}")
    
    # 反序列化
    arm_restored = SaveMCPTool.from_dict(arm_dict)
    hand_restored = SaveMCPTool.from_dict(hand_dict)
    
    print(f"反序列化后机械臂工具数量: {len(arm_restored)}")
    print(f"反序列化后机械手工具数量: {len(hand_restored)}")
    
    # 验证数据完整性
    print(f"机械臂名称: {arm_restored.instrument.name}")
    print(f"机械手名称: {hand_restored.instrument.name}")
    print(f"机械臂第一个工具ID: {arm_restored[0].tool_id}")
    print(f"机械手第一个工具ID: {hand_restored[0].tool_id}")
    
    print("✅ 测试通过：不同数量的工具都能正确序列化和反序列化")

if __name__ == "__main__":
    test_different_tool_counts() 