import json
from typing import Any, MutableMapping


def serialize_scope(scope: MutableMapping[str, Any]) -> str:
    """将 ASGI scope 转换为可读的字符串"""

    def serialize_value(value: Any) -> Any:
        """递归序列化值"""
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        elif isinstance(value, (str, int, float, bool, type(None))):
            return value
        elif isinstance(value, (list, tuple)):
            return [serialize_value(item) for item in value]
        elif isinstance(value, dict):
            # 处理字典键和值的序列化
            return {str(k): serialize_value(v) for k, v in value.items()}
        else:
            # 对于其他类型，转换为字符串
            return str(value)

    result = {}
    for key, value in scope.items():
        str_key = str(key)
        result[str_key] = serialize_value(value)

    return json.dumps(result, indent=2)
