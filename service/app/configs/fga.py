from pydantic_settings import BaseSettings


class FgaConfig(BaseSettings):
    ApiUrl: str = "http://host.docker.internal:8080"
    StoreId: str = ""
    AuthorizationModelId: str = ""
