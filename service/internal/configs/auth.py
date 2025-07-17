from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CasdoorAuthConfig(BaseModel):
    PublicKey: str | None = Field(
        default=None,
        description="Casdoor public key for JWT signature verification",
    )
    Issuer: str = Field(
        default="http://localhost:8000",
        description="Casdoor service address",
    )
    JwksUri: str | None = Field(
        default="http://localhost:8000/.well-known/jwks",
        description="Casdoor JWKS endpoint",
    )
    Algorithm: str = Field(
        default="RS256",
        description="Encryption algorithm used for authentication, typically RS256",
    )
    Audience: str = Field(
        default="2b717a4a24b88beadef2",
        description="Casdoor application Client ID",
    )


class AuthConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",
    )

    Provider: str = Field(default="casdoor", description="Authentication provider")

    Casdoor: CasdoorAuthConfig = Field(
        default_factory=lambda: CasdoorAuthConfig(),
        description="Casdoor authentication configuration",
    )
