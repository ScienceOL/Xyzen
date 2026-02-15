from pydantic_settings import BaseSettings


class FgaConfig(BaseSettings):
    ApiUrl: str = "http://127.0.0.1:8080"
    StoreId: str = ""
    AuthorizationModelId: str = ""
