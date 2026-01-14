"""
简化的token缓存装饰器，用于优化认证性能

Supports both local in-memory cache (single pod) and Redis cache (multi-pod).
This is a synchronous cache used by sync auth provider methods.
"""

import hashlib
import json
import logging
import time
from abc import ABC, abstractmethod
from functools import wraps
from typing import Any, Callable

from . import AuthResult, UserInfo

logger = logging.getLogger(__name__)


def _auth_result_to_json(result: AuthResult) -> str:
    """Serialize AuthResult to JSON string."""
    from dataclasses import asdict

    data = asdict(result)
    return json.dumps(data)


def _json_to_auth_result(json_str: str) -> AuthResult:
    """Deserialize AuthResult from JSON string."""
    data = json.loads(json_str)
    user_info = None
    if data.get("user_info"):
        user_info = UserInfo(**data["user_info"])
    return AuthResult(
        success=data["success"],
        user_info=user_info,
        error_message=data.get("error_message"),
        error_code=data.get("error_code"),
    )


class BaseSimpleTokenCache(ABC):
    """Abstract base class for simple token cache implementations."""

    @abstractmethod
    def get(self, token: str, provider: str) -> AuthResult | None:
        """Get cached authentication result."""
        pass

    @abstractmethod
    def set(self, token: str, provider: str, auth_result: AuthResult) -> None:
        """Set cached authentication result."""
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clear all cached entries."""
        pass

    @abstractmethod
    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        pass


class SimpleTokenCache(BaseSimpleTokenCache):
    """简单的内存token缓存 (for single pod deployments)"""

    def __init__(self, ttl_seconds: int = 300):  # 默认5分钟TTL
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[AuthResult, float]] = {}
        self._max_size = 1000

    def _get_cache_key(self, token: str, provider: str) -> str:
        """生成缓存键"""
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
        logger.debug("Token cache cleared")

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计"""
        return {
            "cache_size": len(self._cache),
            "max_size": self._max_size,
            "ttl_seconds": self.ttl_seconds,
            "backend": "local",
        }


class RedisSimpleTokenCache(BaseSimpleTokenCache):
    """Redis-backed simple token cache for multi-pod deployments.

    Uses synchronous Redis operations since this cache is used in sync contexts.
    """

    CACHE_PREFIX = "auth:simple_token:"

    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._redis: Any = None

    def _get_redis(self) -> Any:
        """Get synchronous Redis client."""
        if self._redis is None:
            import redis

            from app.configs import configs

            self._redis = redis.from_url(
                configs.Redis.REDIS_URL,
                decode_responses=True,
            )
        return self._redis

    def _get_cache_key(self, token: str, provider: str) -> str:
        """Generate cache key using hashed token."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        return f"{self.CACHE_PREFIX}{provider}:{token_hash}"

    def get(self, token: str, provider: str) -> AuthResult | None:
        """Get cached authentication result from Redis."""
        cache_key = self._get_cache_key(token, provider)

        try:
            redis_client = self._get_redis()
            data = redis_client.get(cache_key)

            if not data:
                return None

            logger.debug(f"Redis simple token cache hit for key: {cache_key}")
            return _json_to_auth_result(data)

        except Exception as e:
            logger.error(f"Redis simple token cache get error: {e}")
            return None

    def set(self, token: str, provider: str, auth_result: AuthResult) -> None:
        """Set cached authentication result in Redis."""
        if not auth_result.success:
            return

        cache_key = self._get_cache_key(token, provider)

        try:
            redis_client = self._get_redis()
            json_data = _auth_result_to_json(auth_result)
            redis_client.setex(cache_key, self.ttl_seconds, json_data)
            logger.debug(f"Redis simple token cached for key: {cache_key}, TTL: {self.ttl_seconds}s")

        except Exception as e:
            logger.error(f"Redis simple token cache set error: {e}")

    def clear(self) -> None:
        """Clear all simple token cache entries in Redis."""
        try:
            redis_client = self._get_redis()
            cursor = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match=f"{self.CACHE_PREFIX}*", count=100)
                if keys:
                    redis_client.delete(*keys)
                if cursor == 0:
                    break
            logger.debug("Redis simple token cache cleared")

        except Exception as e:
            logger.error(f"Redis simple token cache clear error: {e}")

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        return {
            "ttl_seconds": self.ttl_seconds,
            "backend": "redis",
        }


# 全局缓存实例
_simple_token_cache: BaseSimpleTokenCache | None = None


def get_simple_token_cache() -> BaseSimpleTokenCache:
    """获取全局简单token缓存实例

    Returns the appropriate cache backend based on configuration:
    - "local": In-memory cache (default, for single pod)
    - "redis": Redis-backed cache (for multi-pod deployments)
    """
    global _simple_token_cache
    if _simple_token_cache is None:
        from app.configs import configs

        if configs.Redis.CacheBackend == "redis":
            logger.info("Using Redis simple token cache backend")
            _simple_token_cache = RedisSimpleTokenCache()
        else:
            logger.info("Using local in-memory simple token cache backend")
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
