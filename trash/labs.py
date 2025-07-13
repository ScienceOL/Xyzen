"""实验室数据管理模块"""

import json
from pathlib import Path
from typing import List

def get_all_lab_ids() -> List[int]:
    """获取所有实验室的ID列表"""
    try:
        data_path = Path(__file__).parent / "labs.json"
        with open(data_path, "r", encoding="utf-8") as f:
            labs_data = json.load(f)
        return [lab_data["lid"] for lab_data in labs_data if "lid" in lab_data]
    except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
        print(f"Error reading labs data: {e}")
        return []

def get_lab_by_id(lid: int) -> dict:
    """根据实验室ID获取实验室数据"""
    try:
        data_path = Path(__file__).parent / "labs.json"
        with open(data_path, "r", encoding="utf-8") as f:
            labs_data = json.load(f)
        for lab_data in labs_data:
            if lab_data.get("lid") == lid:
                return lab_data
        raise ValueError(f"Lab with ID {lid} not found")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise ValueError(f"Error reading labs data: {e}")

def get_lab_tools(lid: int) -> List[dict]:
    """获取指定实验室的工具列表"""
    lab_data = get_lab_by_id(lid)
    return lab_data.get("mcp_tools_available", []) 