"""Session pool for tracking connection states per user.

Uses a Redis HASH per user to track connection states (idle / responding).
Only connections in "responding" state count toward the parallel chat limit.

Redis structure:
    Key:   session_pool:{user_id}
    Type:  HASH
    Field: {connection_id} → JSON{"state": "idle"|"responding",
                                   "registered_at": float,
                                   "last_updated_at": float}
    TTL:   7200s (safety net for the entire HASH key)
"""

import json
import logging
import time

import redis.asyncio as redis

from app.infra.redis import get_redis_client

logger = logging.getLogger(__name__)

_POOL_KEY_PREFIX = "session_pool:"
_POOL_TTL_SECONDS = 7200  # 2 hours — safety net for entire HASH key
_STALE_THRESHOLD_SECONDS = 3600  # 1 hour — auto-fix stale responding entries

# Lua script: atomically check responding count and set connection to responding.
# KEYS[1] = session_pool:{user_id}
# ARGV[1] = connection_id
# ARGV[2] = max_parallel (0 = unlimited)
# ARGV[3] = stale_threshold (seconds)
# ARGV[4] = now (unix timestamp)
# Returns: 1 = ok, 0 = limit reached, -1 = not registered
_CHECK_AND_SET_RESPONDING_LUA = """
local key = KEYS[1]
local conn_id = ARGV[1]
local max_parallel = tonumber(ARGV[2])
local stale_threshold = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Check the target connection exists
local raw = redis.call('HGET', key, conn_id)
if not raw then
    return -1
end

-- If unlimited, just set responding
if max_parallel <= 0 then
    local entry = cjson.decode(raw)
    entry['state'] = 'responding'
    entry['last_updated_at'] = now
    redis.call('HSET', key, conn_id, cjson.encode(entry))
    return 1
end

-- Count non-stale responding entries, auto-fix stale ones
local all = redis.call('HGETALL', key)
local responding_count = 0
for i = 1, #all, 2 do
    local field = all[i]
    local val = all[i + 1]
    local entry = cjson.decode(val)
    if entry['state'] == 'responding' then
        if (now - entry['last_updated_at']) > stale_threshold then
            -- Auto-fix stale entry back to idle
            entry['state'] = 'idle'
            entry['last_updated_at'] = now
            redis.call('HSET', key, field, cjson.encode(entry))
        elseif field ~= conn_id then
            responding_count = responding_count + 1
        end
    end
end

if responding_count >= max_parallel then
    return 0
end

-- Set target connection to responding
local entry = cjson.decode(raw)
entry['state'] = 'responding'
entry['last_updated_at'] = now
redis.call('HSET', key, conn_id, cjson.encode(entry))
return 1
"""

# Lua script: count non-stale responding entries (with auto-fix).
# KEYS[1] = session_pool:{user_id}
# ARGV[1] = stale_threshold (seconds)
# ARGV[2] = now (unix timestamp)
# Returns: integer count
_COUNT_RESPONDING_LUA = """
local key = KEYS[1]
local stale_threshold = tonumber(ARGV[1])
local now = tonumber(ARGV[2])

local all = redis.call('HGETALL', key)
local count = 0
for i = 1, #all, 2 do
    local field = all[i]
    local val = all[i + 1]
    local entry = cjson.decode(val)
    if entry['state'] == 'responding' then
        if (now - entry['last_updated_at']) > stale_threshold then
            entry['state'] = 'idle'
            entry['last_updated_at'] = now
            redis.call('HSET', key, field, cjson.encode(entry))
        else
            count = count + 1
        end
    end
end
return count
"""


def _make_key(user_id: str) -> str:
    return f"{_POOL_KEY_PREFIX}{user_id}"


def _make_entry(state: str) -> str:
    now = time.time()
    return json.dumps({"state": state, "registered_at": now, "last_updated_at": now})


class SessionPool:
    """Manages connection states for a single user."""

    def __init__(self, user_id: str) -> None:
        self._user_id = user_id
        self._key = _make_key(user_id)

    async def register(self, connection_id: str) -> None:
        """Register a connection as idle."""
        r = await get_redis_client()
        await r.hset(self._key, connection_id, _make_entry("idle"))  # type: ignore[misc]
        await r.expire(self._key, _POOL_TTL_SECONDS)

    async def unregister(self, connection_id: str) -> None:
        """Remove a connection from the pool."""
        r = await get_redis_client()
        await r.hdel(self._key, connection_id)  # type: ignore[misc]

    async def set_responding(self, connection_id: str) -> None:
        """Mark a connection as responding (unconditional)."""
        r = await get_redis_client()
        raw: str | None = await r.hget(self._key, connection_id)  # type: ignore[misc]
        if raw is None:
            return
        entry = json.loads(raw)
        entry["state"] = "responding"
        entry["last_updated_at"] = time.time()
        await r.hset(self._key, connection_id, json.dumps(entry))  # type: ignore[misc]
        await r.expire(self._key, _POOL_TTL_SECONDS)

    async def set_idle(self, connection_id: str) -> None:
        """Mark a connection as idle."""
        r = await get_redis_client()
        raw: str | None = await r.hget(self._key, connection_id)  # type: ignore[misc]
        if raw is None:
            return
        entry = json.loads(raw)
        entry["state"] = "idle"
        entry["last_updated_at"] = time.time()
        await r.hset(self._key, connection_id, json.dumps(entry))  # type: ignore[misc]
        await r.expire(self._key, _POOL_TTL_SECONDS)

    async def get_responding_count(self) -> int:
        """Count non-stale responding connections."""
        r = await get_redis_client()
        now = time.time()
        count: int = await r.eval(  # type: ignore[misc]
            _COUNT_RESPONDING_LUA,
            1,
            self._key,
            str(_STALE_THRESHOLD_SECONDS),
            str(now),
        )
        return count

    async def check_and_set_responding(self, connection_id: str, max_parallel: int) -> int:
        """Atomically check limit and set connection to responding.

        Returns:
            1  — success (connection marked as responding)
            0  — limit reached
            -1 — connection not registered
        """
        r = await get_redis_client()
        now = time.time()
        result: int = await r.eval(  # type: ignore[misc]
            _CHECK_AND_SET_RESPONDING_LUA,
            1,
            self._key,
            connection_id,
            str(max_parallel),
            str(_STALE_THRESHOLD_SECONDS),
            str(now),
        )
        if result == 1:
            await r.expire(self._key, _POOL_TTL_SECONDS)
        return result

    async def get_all_connections(self) -> dict[str, dict[str, object]]:
        """Return all connections and their states (for debugging)."""
        r = await get_redis_client()
        raw_all: dict[str, str] = await r.hgetall(self._key)  # type: ignore[misc]
        return {k: json.loads(v) for k, v in raw_all.items()}


# ---------------------------------------------------------------------------
# Module-level helper for Celery workers (use their own Redis connection)
# ---------------------------------------------------------------------------


async def mark_connection_idle(
    redis_client: redis.Redis,
    user_id: str,
    connection_id: str,
) -> None:
    """Mark a connection as idle using a provided Redis client.

    Designed for Celery workers that maintain their own Redis connections.
    """
    key = _make_key(user_id)
    raw: str | None = await redis_client.hget(key, connection_id)  # type: ignore[misc]
    if raw is None:
        return
    entry = json.loads(raw)
    entry["state"] = "idle"
    entry["last_updated_at"] = time.time()
    await redis_client.hset(key, connection_id, json.dumps(entry))  # type: ignore[misc]
    await redis_client.expire(key, _POOL_TTL_SECONDS)
