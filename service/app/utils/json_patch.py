"""
JSON Monkey Patch - 修复 pydantic 类型的 JSON 序列化问题

这个模块通过 monkey patch 的方式修复 fastmcp 中的 JSON 序列化问题，
特别是 AnyUrl 等 pydantic 类型无法序列化的问题。
"""

import json
from typing import Any

# 保存原始的 json.dumps 函数
_original_json_dumps = json.dumps


def pydantic_aware_json_dumps(obj: Any, **kwargs: Any) -> str:
    """
    支持 pydantic 类型的 JSON 序列化函数

    Args:
        obj: 要序列化的对象
        **kwargs: json.dumps 的其他参数

    Returns:
        JSON 字符串
    """
    # 创建一个自定义的 default 函数
    original_default = kwargs.get("default")

    def pydantic_default(o: Any) -> Any:
        # 处理 pydantic 的 AnyUrl 类型
        if hasattr(o, "__class__") and "AnyUrl" in str(type(o)):
            return str(o)

        # 处理 pydantic 模型
        if hasattr(o, "model_dump"):
            try:
                return o.model_dump()
            except Exception:
                return str(o)

        # 如果有原始的 default 函数，尝试使用它
        if original_default:
            try:
                return original_default(o)
            except TypeError:
                pass

        # 默认处理：转换为字符串
        try:
            return str(o)
        except Exception:
            return f"<{type(o).__name__} object>"

    # 更新 kwargs 中的 default 函数
    kwargs["default"] = pydantic_default

    # 调用原始的 json.dumps
    return _original_json_dumps(obj, **kwargs)


def apply_json_patch() -> None:
    """
    应用 JSON monkey patch
    """
    # 替换 json.dumps 函数
    json.dumps = pydantic_aware_json_dumps


def remove_json_patch() -> None:
    """
    移除 JSON monkey patch，恢复原始函数
    """
    json.dumps = _original_json_dumps


if __name__ == "__main__":
    apply_json_patch()
