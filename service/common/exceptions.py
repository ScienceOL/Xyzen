"""自定义异常类

定义应用程序中使用的自定义异常
"""

from typing import Any, Dict, Optional


class InsufficientBalanceError(Exception):
    """余额不足异常

    当用户的光子余额不足时抛出此异常
    """

    def __init__(
        self,
        message: str = "Insufficient balance",
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Args:
            message: 用户友好的错误消息
            error_code: 错误代码
            details: 附加的错误详情
        """
        self.message = message
        self.error_code = error_code or "INSUFFICIENT_BALANCE"
        self.details = details or {}
        super().__init__(self.message)

    def __str__(self) -> str:
        return f"[{self.error_code}] {self.message}"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，方便序列化"""
        return {
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details,
        }
