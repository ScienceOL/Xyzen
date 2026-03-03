"""Redis-backed circuit breaker for LLM providers.

Tracks provider failures and temporarily marks providers as unavailable
when failures exceed a threshold. This enables automatic failover to
alternative providers at the tier selection level.

States:
  CLOSED → Provider healthy, requests flow normally
  OPEN   → Failures exceeded threshold, provider marked unavailable
           (all requests routed to alternative providers)

After the cooldown expires, the circuit returns to CLOSED and the provider
is retried normally. If it fails again, the circuit re-opens.

The circuit breaker degrades gracefully: if Redis is unavailable, all
providers are treated as available (fail-open).

Note: timestamps use the local system clock (time.time()). In multi-pod
deployments with clock skew, the cooldown duration may vary by a few
seconds across pods, which is acceptable for this use case.
"""

import logging
import time

from app.schemas.provider import ProviderType

logger = logging.getLogger(__name__)

# Circuit breaker configuration
FAILURE_THRESHOLD = 3  # Number of failures to trip the circuit
WINDOW_SECONDS = 120  # Time window for counting failures
COOLDOWN_SECONDS = 60  # How long to keep circuit open


def _failure_key(provider_type: ProviderType) -> str:
    return f"provider:circuit:{provider_type.value}:failures"


def _open_key(provider_type: ProviderType) -> str:
    return f"provider:circuit:{provider_type.value}:open_until"


class ProviderCircuitBreaker:
    """Redis-backed circuit breaker for LLM providers."""

    @classmethod
    async def _get_redis(cls):
        try:
            from app.infra.redis import get_redis_client

            return await get_redis_client()
        except Exception:
            return None

    @classmethod
    async def record_failure(cls, provider_type: ProviderType) -> None:
        """Record a provider failure. Opens circuit if threshold exceeded."""
        redis_client = await cls._get_redis()
        if not redis_client:
            return

        try:
            key = _failure_key(provider_type)
            count = await redis_client.incr(key)
            # Always set TTL to prevent orphaned keys (idempotent)
            await redis_client.expire(key, WINDOW_SECONDS)

            if count >= FAILURE_THRESHOLD:
                open_until = time.time() + COOLDOWN_SECONDS
                await redis_client.set(
                    _open_key(provider_type),
                    str(open_until),
                    ex=COOLDOWN_SECONDS + 10,
                )
                logger.warning(
                    f"Circuit OPEN for {provider_type.value}: "
                    f"{count} failures in {WINDOW_SECONDS}s, cooldown {COOLDOWN_SECONDS}s"
                )
        except Exception as e:
            logger.warning(f"Circuit breaker record_failure error: {e}")

    @classmethod
    async def record_success(cls, provider_type: ProviderType) -> None:
        """Record a successful provider call. Resets failure count and closes circuit."""
        redis_client = await cls._get_redis()
        if not redis_client:
            return

        try:
            await redis_client.delete(_failure_key(provider_type), _open_key(provider_type))
        except Exception as e:
            logger.warning(f"Circuit breaker record_success error: {e}")

    @classmethod
    async def is_available(cls, provider_type: ProviderType) -> bool:
        """Check if a provider is available (circuit is CLOSED or cooldown expired).

        Returns True if:
          - Redis is unavailable (fail-open)
          - Circuit is CLOSED (no open_until key)
          - Cooldown expired (open_until timestamp in the past)

        Returns False if:
          - Circuit is OPEN (cooldown not yet expired)
        """
        redis_client = await cls._get_redis()
        if not redis_client:
            return True  # Fail-open: treat as available if Redis is down

        try:
            open_until_str = await redis_client.get(_open_key(provider_type))
            if not open_until_str:
                return True  # Circuit CLOSED

            open_until = float(open_until_str)
            if time.time() >= open_until:
                return True  # Cooldown expired

            return False  # Circuit OPEN
        except Exception as e:
            logger.warning(f"Circuit breaker is_available error: {e}")
            return True  # Fail-open on error

    @classmethod
    async def reset(cls, provider_type: ProviderType) -> None:
        """Manually reset a provider's circuit breaker."""
        redis_client = await cls._get_redis()
        if not redis_client:
            return

        try:
            await redis_client.delete(_failure_key(provider_type), _open_key(provider_type))
            logger.info(f"Circuit breaker reset for {provider_type.value}")
        except Exception as e:
            logger.warning(f"Circuit breaker reset error: {e}")
