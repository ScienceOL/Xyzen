"""
Token 缓存服务，减少重复的认证服务商调用
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from . import AuthResult

logger = logging.getLogger(__name__)


@dataclass
class CachedAuthResult:
    """缓存的认证结果"""

    auth_result: AuthResult
    cached_at: datetime = field(default_factory=datetime.now)
    expires_at: datetime | None = None

    def is_expired(self) -> bool:
        """检查缓存是否过期"""
        if self.expires_at:
            return datetime.now() >= self.expires_at
        # 默认缓存5分钟
        return datetime.now() >= self.cached_at + timedelta(minutes=5)


class TokenCache:
    """Token 缓存管理器"""

    def __init__(self, default_ttl_minutes: int = 5, max_size: int = 1000):
        self.default_ttl_minutes = default_ttl_minutes
        self.max_size = max_size
        self._cache: dict[str, CachedAuthResult] = {}
        self._lock = asyncio.Lock()

        # 启动定期清理任务
        asyncio.create_task(self._cleanup_task())

    def _get_cache_key(self, token: str, provider: str) -> str:
        """生成缓存键，使用token的hash而不是完整token来节省内存"""
        import hashlib

        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        return f"{provider}:{token_hash}"

    async def get(self, token: str, provider: str) -> AuthResult | None:
        """从缓存获取认证结果"""
        cache_key = self._get_cache_key(token, provider)

        async with self._lock:
            cached_result = self._cache.get(cache_key)

            if not cached_result:
                return None

            if cached_result.is_expired():
                logger.debug(f"Token cache expired for key: {cache_key}")
                del self._cache[cache_key]
                return None

            logger.debug(
                f"Token cache hit for key: {cache_key}, user: {cached_result.auth_result.user_info.username if cached_result.auth_result.user_info else 'None'}"  # noqa
            )
            return cached_result.auth_result

    async def set(self, token: str, provider: str, auth_result: AuthResult, ttl_minutes: int | None = None) -> None:
        """设置缓存"""
        if not auth_result.success:
            # 不缓存失败的结果
            return

        cache_key = self._get_cache_key(token, provider)
        ttl = ttl_minutes or self.default_ttl_minutes

        cached_result = CachedAuthResult(auth_result=auth_result, expires_at=datetime.now() + timedelta(minutes=ttl))

        async with self._lock:
            # 如果缓存已满，清理一些过期的条目
            if len(self._cache) >= self.max_size:
                await self._cleanup_expired()

                # 如果清理后仍然满了，删除最旧的条目
                if len(self._cache) >= self.max_size:
                    oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k].cached_at)
                    del self._cache[oldest_key]

            self._cache[cache_key] = cached_result
            logger.debug(f"Token cached for key: {cache_key}, expires at: {cached_result.expires_at}")

    async def invalidate(self, token: str, provider: str) -> None:
        """使特定token的缓存失效"""
        cache_key = self._get_cache_key(token, provider)
        async with self._lock:
            self._cache.pop(cache_key, None)
            logger.debug(f"Token cache invalidated for key: {cache_key}")

    async def clear(self) -> None:
        """清空所有缓存"""
        async with self._lock:
            self._cache.clear()
            logger.debug("Token cache cleared")

    async def _cleanup_expired(self) -> None:
        """清理过期的缓存条目"""
        expired_keys: list[str] = []
        for key, cached_result in self._cache.items():
            if cached_result.is_expired():
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    async def _cleanup_task(self) -> None:
        """定期清理任务"""
        while True:
            try:
                await asyncio.sleep(300)  # 每5分钟清理一次
                async with self._lock:
                    await self._cleanup_expired()
            except Exception as e:
                logger.error(f"Token cache cleanup task error: {e}")

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计信息"""
        return {
            "cache_size": len(self._cache),
            "max_size": self.max_size,
            "default_ttl_minutes": self.default_ttl_minutes,
        }


# 全局缓存实例
_token_cache: TokenCache | None = None


def get_token_cache() -> TokenCache:
    """获取全局token缓存实例"""
    global _token_cache
    if _token_cache is None:
        _token_cache = TokenCache()
    return _token_cache
