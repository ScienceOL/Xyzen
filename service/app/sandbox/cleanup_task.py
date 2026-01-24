"""
沙箱清理任务

后台任务，定期清理超时的沙箱实例。
"""

import asyncio
import logging

from app.sandbox.manager import E2BSandboxManager

logger = logging.getLogger(__name__)

# 清理间隔（秒）
CLEANUP_INTERVAL_SECS = 60

# 停止事件，用于优雅关闭
_stop_event: asyncio.Event | None = None


async def start_cleanup_task() -> None:
    """
    启动后台清理任务

    每 60 秒检查一次，清理超时的沙箱实例。
    此函数应在 FastAPI 启动时作为后台任务运行。
    可通过 stop_cleanup_task() 优雅停止。
    """
    global _stop_event
    _stop_event = asyncio.Event()

    logger.info("Sandbox cleanup task started")

    while not _stop_event.is_set():
        try:
            # 使用 wait_for 来实现可取消的等待
            await asyncio.wait_for(_stop_event.wait(), timeout=CLEANUP_INTERVAL_SECS)
            # 如果 event 被设置，退出循环
            break
        except asyncio.TimeoutError:
            # 超时说明该执行清理了
            pass
        except asyncio.CancelledError:
            logger.info("Sandbox cleanup task cancelled")
            raise

        try:
            manager = E2BSandboxManager.get_instance()
            await manager.cleanup_expired()
        except asyncio.CancelledError:
            logger.info("Sandbox cleanup task cancelled during cleanup")
            raise
        except Exception as e:
            logger.error(f"Sandbox cleanup task error: {e}")

    logger.info("Sandbox cleanup task stopped")


async def stop_cleanup_task() -> None:
    """
    停止清理任务

    设置停止事件，使清理任务在下一个周期结束后退出。
    """
    global _stop_event
    if _stop_event:
        _stop_event.set()
        logger.info("Sandbox cleanup task stop requested")
