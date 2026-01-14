"""
Token 缓存服务，减少重复的认证服务商调用

Supports both local in-memory cache (single pod) and Redis cache (multi-pod).
"""

import asyncio
import hashlib
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Any

from . import AuthResult, UserInfo

logger = logging.getLogger(__name__)


def _auth_result_to_json(result: AuthResult) -> str:
    """Serialize AuthResult to JSON string."""
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


class BaseTokenCache(ABC):
    """Abstract base class for token cache implementations."""

    @abstractmethod
    async def get(self, token: str, provider: str) -> AuthResult | None:
        """Get cached authentication result."""
        pass

    @abstractmethod
    async def set(self, token: str, provider: str, auth_result: AuthResult, ttl_minutes: int | None = None) -> None:
        """Set cached authentication result."""
        pass

    @abstractmethod
    async def invalidate(self, token: str, provider: str) -> None:
        """Invalidate cached authentication result."""
        pass

    @abstractmethod
    async def clear(self) -> None:
        """Clear all cached entries."""
        pass

    @abstractmethod
    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        pass


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


class TokenCache(BaseTokenCache):
    """Token 缓存管理器 (In-memory implementation for single pod)"""

    def __init__(self, default_ttl_minutes: int = 5, max_size: int = 1000):
        self.default_ttl_minutes = default_ttl_minutes
        self.max_size = max_size
        self._cache: dict[str, CachedAuthResult] = {}
        self._lock = asyncio.Lock()

        # 启动定期清理任务
        asyncio.create_task(self._cleanup_task())

    def _get_cache_key(self, token: str, provider: str) -> str:
        """生成缓存键，使用token的hash而不是完整token来节省内存"""
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
            "backend": "local",
        }


class RedisTokenCache(BaseTokenCache):
    """Token cache backed by Redis for multi-pod deployments."""

    CACHE_PREFIX = "auth:token:"

    def __init__(self, default_ttl_minutes: int = 5):
        self.default_ttl_minutes = default_ttl_minutes
        self._redis: Any = None  # Lazy initialization

    async def _get_redis(self) -> Any:
        """Get Redis client lazily."""
        if self._redis is None:
            from app.infra.redis import get_redis_client

            self._redis = await get_redis_client()
        return self._redis

    def _get_cache_key(self, token: str, provider: str) -> str:
        """Generate cache key using hashed token."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        return f"{self.CACHE_PREFIX}{provider}:{token_hash}"

    async def get(self, token: str, provider: str) -> AuthResult | None:
        """Get cached authentication result from Redis."""
        cache_key = self._get_cache_key(token, provider)

        try:
            redis = await self._get_redis()
            data = await redis.get(cache_key)

            if not data:
                return None

            logger.debug(f"Redis token cache hit for key: {cache_key}")
            return _json_to_auth_result(data)

        except Exception as e:
            logger.error(f"Redis token cache get error: {e}")
            return None

    async def set(self, token: str, provider: str, auth_result: AuthResult, ttl_minutes: int | None = None) -> None:
        """Set cached authentication result in Redis."""
        if not auth_result.success:
            return

        cache_key = self._get_cache_key(token, provider)
        ttl_seconds = (ttl_minutes or self.default_ttl_minutes) * 60

        try:
            redis = await self._get_redis()
            json_data = _auth_result_to_json(auth_result)
            await redis.setex(cache_key, ttl_seconds, json_data)
            logger.debug(f"Redis token cached for key: {cache_key}, TTL: {ttl_seconds}s")

        except Exception as e:
            logger.error(f"Redis token cache set error: {e}")

    async def invalidate(self, token: str, provider: str) -> None:
        """Invalidate cached authentication result in Redis."""
        cache_key = self._get_cache_key(token, provider)

        try:
            redis = await self._get_redis()
            await redis.delete(cache_key)
            logger.debug(f"Redis token cache invalidated for key: {cache_key}")

        except Exception as e:
            logger.error(f"Redis token cache invalidate error: {e}")

    async def clear(self) -> None:
        """Clear all token cache entries in Redis."""
        try:
            redis = await self._get_redis()
            # Use SCAN to find all keys with our prefix
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=f"{self.CACHE_PREFIX}*", count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
            logger.debug("Redis token cache cleared")

        except Exception as e:
            logger.error(f"Redis token cache clear error: {e}")

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        return {
            "default_ttl_minutes": self.default_ttl_minutes,
            "backend": "redis",
        }


# 全局缓存实例
_token_cache: BaseTokenCache | None = None


def get_token_cache() -> BaseTokenCache:
    """获取全局token缓存实例

    Returns the appropriate cache backend based on configuration:
    - "local": In-memory cache (default, for single pod)
    - "redis": Redis-backed cache (for multi-pod deployments)
    """
    global _token_cache
    if _token_cache is None:
        from app.configs import configs

        if configs.Redis.CacheBackend == "redis":
            logger.info("Using Redis token cache backend")
            _token_cache = RedisTokenCache()
        else:
            logger.info("Using local in-memory token cache backend")
            _token_cache = TokenCache()
    return _token_cache
