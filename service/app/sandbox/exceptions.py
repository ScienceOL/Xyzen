"""
沙箱异常类

定义 E2B 沙箱相关的异常。
"""


class SandboxError(Exception):
    """沙箱基础异常类"""

    pass


class SandboxNotFoundError(SandboxError):
    """沙箱不存在异常"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        super().__init__(f"Sandbox not found for session: {session_id}")


class SandboxStartError(SandboxError):
    """沙箱启动失败异常"""

    def __init__(self, message: str, cause: Exception | None = None):
        self.cause = cause
        super().__init__(message)


class SandboxExecutionError(SandboxError):
    """代码执行异常"""

    def __init__(self, message: str, code: str | None = None):
        self.code = code
        super().__init__(message)


class SandboxTimeoutError(SandboxError):
    """沙箱操作超时异常"""

    def __init__(self, operation: str, timeout_secs: int):
        self.operation = operation
        self.timeout_secs = timeout_secs
        super().__init__(f"{operation} timed out after {timeout_secs} seconds")


class SandboxFileError(SandboxError):
    """文件操作异常"""

    def __init__(self, message: str, path: str | None = None):
        self.path = path
        super().__init__(message)
