from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


class RedisConfig(BaseSettings):
    HOST: str = "localhost"
    PORT: int = 6379
    DB: int = 0
    PASSWORD: str | None = None

    # Cache backend: "local" for in-memory (single pod), "redis" for distributed
    CacheBackend: Literal["local", "redis"] = Field(
        default="redis",
        description="Cache backend for token auth and other caches. Use 'redis' for multi-pod deployments.",
    )

    @property
    def REDIS_URL(self) -> str:
        if self.PASSWORD:
            return f"redis://:{self.PASSWORD}@{self.HOST}:{self.PORT}/{self.DB}"
        return f"redis://{self.HOST}:{self.PORT}/{self.DB}"


redis_settings = RedisConfig()
