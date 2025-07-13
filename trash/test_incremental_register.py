#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试仪器增量注册功能
"""

import json
from models import Instrument, Action, InstrumentsData
from tools.register import register_instruments_batch, load_existing_data

def create_instruments_data_from_dict(data: dict) -> InstrumentsData:
    """从字典创建InstrumentsData对象"""
    instruments = {}
    for instrument_id, instrument_data in data["Instruments"].items():
        actions = {}
        for action_id, action_data in instrument_data["actions"].items():
            actions[action_id] = Action(**action_data)
        instruments[instrument_id] = Instrument(**instrument_data)
    
    return InstrumentsData(Instruments=instruments)

def test_incremental_registration():
    """测试增量注册功能"""
    print("=== 测试增量注册功能 ===")
    
    # 第一次注册 - 创建初始数据
    print("\n1. 第一次注册 - 创建初始数据")
    initial_data = {
        "Instruments": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": {
                    "I1_A1": {
                        "name": "I1_A1",
                        "description": "I1_A1",
                        "parameters": {}
                    },
                    "I1_A2": {
                        "name": "I1_A2",
                        "description": "I1_A2",
                        "parameters": {}
                    }
                }
            }
        }
    }
    
    instruments_data = create_instruments_data_from_dict(initial_data)
    success, message, success_list = register_instruments_batch(instruments_data)
    print(f"结果: {success}")
    print(f"消息: {message}")
    print(f"成功注册的仪器: {success_list}")
    
    # 显示当前数据
    existing_data = load_existing_data()
    print(f"当前注册的仪器数量: {len(existing_data)}")
    for item in existing_data:
        print(f"  仪器: {item.instrument.name}, 工具数量: {len(item.tools)}")
        for tool in item.tools:
            print(f"    工具: {tool.name}")
    
    # 第二次注册 - 添加新仪器
    print("\n2. 第二次注册 - 添加新仪器")
    new_instrument_data = {
        "Instruments": {
            "I2": {
                "name": "I2",
                "description": "I2",
                "actions": {
                    "I2_A1": {
                        "name": "I2_A1",
                        "description": "I2_A1",
                        "parameters": {}
                    }
                }
            }
        }
    }
    
    instruments_data = create_instruments_data_from_dict(new_instrument_data)
    success, message, success_list = register_instruments_batch(instruments_data)
    print(f"结果: {success}")
    print(f"消息: {message}")
    print(f"成功注册的仪器: {success_list}")
    
    # 显示当前数据
    existing_data = load_existing_data()
    print(f"当前注册的仪器数量: {len(existing_data)}")
    for item in existing_data:
        print(f"  仪器: {item.instrument.name}, 工具数量: {len(item.tools)}")
        for tool in item.tools:
            print(f"    工具: {tool.name}")
    
    # 第三次注册 - 为现有仪器添加新动作
    print("\n3. 第三次注册 - 为现有仪器添加新动作")
    incremental_data = {
        "Instruments": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": {
                    "I1_A3": {
                        "name": "I1_A3",
                        "description": "I1_A3",
                        "parameters": {}
                    },
                    "I1_A4": {
                        "name": "I1_A4",
                        "description": "I1_A4",
                        "parameters": {}
                    }
                }
            }
        }
    }
    
    instruments_data = create_instruments_data_from_dict(incremental_data)
    success, message, success_list = register_instruments_batch(instruments_data)
    print(f"结果: {success}")
    print(f"消息: {message}")
    print(f"成功注册的仪器: {success_list}")
    
    # 显示最终数据
    existing_data = load_existing_data()
    print(f"\n最终注册的仪器数量: {len(existing_data)}")
    for item in existing_data:
        print(f"  仪器: {item.instrument.name}, 工具数量: {len(item.tools)}")
        for tool in item.tools:
            print(f"    工具: {tool.name}")

def test_duplicate_prevention():
    """测试重复预防功能"""
    print("\n=== 测试重复预防功能 ===")
    
    # 尝试注册重复的动作
    duplicate_data = {
        "Instruments": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": {
                    "I1_A1": {
                        "name": "I1_A1",
                        "description": "I1_A1",
                        "parameters": {}
                    }
                }
            }
        }
    }
    
    instruments_data = create_instruments_data_from_dict(duplicate_data)
    success, message, success_list = register_instruments_batch(instruments_data)
    print(f"重复注册结果: {success}")
    print(f"消息: {message}")
    print(f"成功注册的仪器: {success_list}")
    
    # 显示数据确认没有重复
    existing_data = load_existing_data()
    print(f"当前注册的仪器数量: {len(existing_data)}")
    for item in existing_data:
        print(f"  仪器: {item.instrument.name}, 工具数量: {len(item.tools)}")
        tool_names = [tool.name for tool in item.tools]
        print(f"    工具: {tool_names}")

if __name__ == "__main__":
    test_incremental_registration()
    test_duplicate_prevention() 