from pydantic_settings import BaseSettings


class RedisConfig(BaseSettings):
    HOST: str = "localhost"
    PORT: int = 6379
    DB: int = 0
    PASSWORD: str | None = None

    @property
    def REDIS_URL(self) -> str:
        if self.PASSWORD:
            return f"redis://:{self.PASSWORD}@{self.HOST}:{self.PORT}/{self.DB}"
        return f"redis://{self.HOST}:{self.PORT}/{self.DB}"


redis_settings = RedisConfig()
