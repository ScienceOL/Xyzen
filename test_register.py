#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试仪器批量注册功能
"""

import json
from tools.register import validate_instruments_structure, register_instruments_batch

def test_structure_validation():
    """测试结构验证功能"""
    print("=== 测试结构验证功能 ===")
    
    # 测试正确的数据结构
    correct_data = {
        "Instruments": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": {
                    "I1_A1": {
                        "name": "I1_A1",
                        "description": "I1_A1"
                    },
                    "I1_A2": {
                        "name": "I1_A2",
                        "description": "I1_A2"
                    }
                }
            }
        }
    }
    
    is_valid, message = validate_instruments_structure(correct_data)
    print(f"正确数据结构测试: {is_valid} - {message}")
    
    # 测试缺少顶层键的数据
    wrong_data1 = {
        "WrongKey": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": {}
            }
        }
    }
    
    is_valid, message = validate_instruments_structure(wrong_data1)
    print(f"缺少顶层键测试: {is_valid} - {message}")
    
    # 测试缺少必需字段的数据
    wrong_data2 = {
        "Instruments": {
            "I1": {
                "name": "I1",
                # 缺少 description 和 actions
            }
        }
    }
    
    is_valid, message = validate_instruments_structure(wrong_data2)
    print(f"缺少必需字段测试: {is_valid} - {message}")
    
    # 测试actions不是字典的数据
    wrong_data3 = {
        "Instruments": {
            "I1": {
                "name": "I1",
                "description": "I1",
                "actions": "not_a_dict"
            }
        }
    }
    
    is_valid, message = validate_instruments_structure(wrong_data3)
    print(f"actions不是字典测试: {is_valid} - {message}")

def test_batch_registration():
    """测试批量注册功能"""
    print("\n=== 测试批量注册功能 ===")
    
    # 从文件读取测试数据
    try:
        with open("data/instruments.json", "r", encoding="utf-8") as f:
            test_data = json.load(f)
        
        success, message, success_list = register_instruments_batch(test_data)
        print(f"批量注册结果: {success}")
        print(f"消息: {message}")
        print(f"成功注册的仪器: {success_list}")
        
    except FileNotFoundError:
        print("未找到 data/instruments.json 文件")
    except Exception as e:
        print(f"测试过程中发生错误: {e}")

if __name__ == "__main__":
    test_structure_validation()
    test_batch_registration() 