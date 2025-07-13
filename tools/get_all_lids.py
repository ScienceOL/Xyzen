# Python官方库导入
from typing_extensions import List
import json

def get_all_lids() -> List[int]:# 获取所有实验室的Lab ID
    lids_list = []
    with open("data/labs.json", "r", encoding="utf-8") as f:
        labs_data = json.load(f)
    for lab in labs_data:
        lids_list.append(lab["lid"])
    return lids_list
