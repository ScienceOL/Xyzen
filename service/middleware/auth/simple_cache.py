"""
简化的token缓存装饰器，用于优化认证性能
"""

import logging
import time
from functools import wraps
from typing import Any, Callable

from . import AuthResult

logger = logging.getLogger(__name__)


class SimpleTokenCache:
    """简单的内存token缓存"""

    def __init__(self, ttl_seconds: int = 300):  # 默认5分钟TTL
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[AuthResult, float]] = {}
        self._max_size = 1000

    def _get_cache_key(self, token: str, provider: str) -> str:
        """生成缓存键"""
        import hashlib

        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        return f"{provider}:{token_hash}"

    def get(self, token: str, provider: str) -> AuthResult | None:
        """获取缓存的认证结果"""
        cache_key = self._get_cache_key(token, provider)
        cached_item = self._cache.get(cache_key)

        if not cached_item:
            return None

        auth_result, timestamp = cached_item

        # 检查是否过期
        if time.time() - timestamp > self.ttl_seconds:
            del self._cache[cache_key]
            logger.debug(f"Token cache expired for key: {cache_key}")
            return None

        logger.debug(f"Token cache hit for key: {cache_key}")
        return auth_result

    def set(self, token: str, provider: str, auth_result: AuthResult) -> None:
        """设置缓存"""
        if not auth_result.success:
            return  # 不缓存失败结果

        cache_key = self._get_cache_key(token, provider)

        # 如果缓存满了，清理一些旧条目
        if len(self._cache) >= self._max_size:
            self._cleanup_expired()

            # 如果清理后仍然满了，删除最旧的条目
            if len(self._cache) >= self._max_size:
                oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
                del self._cache[oldest_key]

        self._cache[cache_key] = (auth_result, time.time())
        logger.debug(f"Token cached for key: {cache_key}")

    def _cleanup_expired(self) -> None:
        """清理过期条目"""
        current_time = time.time()
        expired_keys: list[str] = []

        for key, (_, timestamp) in self._cache.items():
            if current_time - timestamp > self.ttl_seconds:
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    def clear(self) -> None:
        """清空缓存"""
        self._cache.clear()
        logger.info("Token cache cleared")

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计"""
        return {"cache_size": len(self._cache), "max_size": self._max_size, "ttl_seconds": self.ttl_seconds}


# 全局缓存实例
_simple_token_cache: SimpleTokenCache | None = None


def get_simple_token_cache() -> SimpleTokenCache:
    """获取全局简单token缓存实例"""
    global _simple_token_cache
    if _simple_token_cache is None:
        _simple_token_cache = SimpleTokenCache()
    return _simple_token_cache


def cached_token_validation(func: Callable[..., AuthResult]) -> Callable[..., AuthResult]:
    """Token验证缓存装饰器"""

    @wraps(func)
    def wrapper(self: Any, access_token: str) -> AuthResult:
        cache = get_simple_token_cache()
        provider_name = self.get_provider_name()

        # 尝试从缓存获取
        cached_result = cache.get(access_token, provider_name)
        if cached_result:
            return cached_result

        # 执行实际验证
        result = func(self, access_token)

        # 缓存成功结果
        if result.success:
            cache.set(access_token, provider_name, result)

        return result

    return wrapper
