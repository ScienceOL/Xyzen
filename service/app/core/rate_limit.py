"""Redis sliding window rate limiter with FastAPI dependencies."""

import logging
import time
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status

from app.infra.redis import get_redis_client
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

# Lua script: atomic sliding window check + add using sorted set.
# KEYS[1] = rate limit key
# ARGV[1] = window start timestamp (now - window_seconds)
# ARGV[2] = current timestamp
# ARGV[3] = max_requests
# ARGV[4] = unique member id
# ARGV[5] = TTL in seconds
#
# Returns 1 if allowed, 0 if rate limited.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count remaining entries
local count = redis.call('ZCARD', key)

if count >= max_requests then
    return 0
end

-- Add new entry and set expiry
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return 1
"""


@dataclass(frozen=True)
class RateLimitConfig:
    max_requests: int
    window_seconds: int


UPLOAD_RATE_LIMIT = RateLimitConfig(max_requests=30, window_seconds=60)
DOWNLOAD_RATE_LIMIT = RateLimitConfig(max_requests=60, window_seconds=60)


async def _check_rate_limit(action: str, user_id: str, config: RateLimitConfig) -> None:
    """Check rate limit for an action and raise 429 if exceeded."""
    redis = await get_redis_client()
    now = time.time()
    key = f"ratelimit:{action}:{user_id}"
    window_start = now - config.window_seconds
    member = str(uuid.uuid4())
    ttl = config.window_seconds + 10

    result = await redis.eval(  # type: ignore[union-attr]
        _SLIDING_WINDOW_LUA,
        1,
        key,
        str(window_start),
        str(now),
        str(config.max_requests),
        member,
        str(ttl),
    )

    if result == 0:
        logger.warning(f"Rate limit exceeded for {action} by user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many {action} requests. Please wait and try again.",
            headers={"Retry-After": str(config.window_seconds)},
        )


async def enforce_upload_rate_limit(
    user_id: str = Depends(get_current_user),
) -> str:
    """FastAPI dependency that enforces upload rate limiting. Returns user_id."""
    await _check_rate_limit("upload", user_id, UPLOAD_RATE_LIMIT)
    return user_id


async def enforce_download_rate_limit(
    user_id: str = Depends(get_current_user),
) -> str:
    """FastAPI dependency that enforces download rate limiting. Returns user_id."""
    await _check_rate_limit("download", user_id, DOWNLOAD_RATE_LIMIT)
    return user_id
