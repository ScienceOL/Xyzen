from enum import Enum

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthProviderConfigBase(BaseModel):
    """认证提供者配置基类 - 统一所有认证提供者的配置接口"""

    PublicKey: str | None = Field(
        default=None,
        description="Public key for token signature verification (JWT providers only)",
    )

    Issuer: str = Field(
        default="",
        description="Authentication service address or user info endpoint",
    )

    JwksUri: str | None = Field(
        default=None,
        description="JWKS endpoint for public key discovery (JWT providers only)",
    )

    Algorithm: str = Field(
        default="RS256",
        description="Encryption algorithm used for authentication",
    )

    Audience: str = Field(
        default="",
        description="Application Client ID or audience claim",
    )


class CasdoorAuthConfig(AuthProviderConfigBase):
    """Casdoor 认证配置"""

    PublicKey: str | None = Field(
        default="""-----BEGIN CERTIFICATE-----
MIIE3TCCAsWgAwIBAgIDAeJAMA0GCSqGSIb3DQEBCwUAMCgxDjAMBgNVBAoTBWFkbWluMRYwFAYDVQQDEw1jZXJ0LWJ1aWx0LWluMB4XDTI0MDkwOTA5MjYxMVoXDTQ0MDkwOTA5MjYxMVowKDEOMAwGA1UEChMFYWRtaW4xFjAUBgNVBAMTDWNlcnQtYnVpbHQtaW4wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQC3EnylZ2VurCm4gVtZHBUw67qvuKoYuU9whqaJr2UQEboIX4ca+FtZCjDgcBoD80lwSoYrcKpTG+DIVEMDznUHOjKwongRWclV1jeE3jZqObtmG9872yt/WX+nxQLyDrk+nUGhci6QrhgoYToN1DYaMqMV1Pi8catx8S0W3gg+ilb9mG3xdFpQo89o84mJhajTE/5/0jBuQ50Dx8CRolpRWjZ6i9RNVfFQglei+aW0RNf1PY6RqMkxc/Hy0XwXf/bjM5Ax7Aajwtehx0Q1zeUaRMMhFu6REtz345oJdLJpUkpFwJN4dPQ35a0tqnjkD1MLZjvBhSgOt5IPAJA1HmcR83RMBS8B3iV6y/clPjr02cjyasORy+kL/aFMfZfwvuRWX1NqRE99+rUTlPszH2SQi7PCUItQK72nnMYWBMXgyS8/Mra48q7LDAB/ZQnWuEG1+P1SdsQUWM2UaxkgjmfMNATVAgufrLOcOZDxAwVS7+quCF5f/QPTWaFqz5ofcpoUlf0iriv/k1mil7OghX0eqyLI2cCSma+dgB1eMni91eDCLVRT25mGDYreFjkpAwpMx2uaBk5e6ffT2jmZ2Zp9iCrUomLXDNiwY2wZDClcDKFiHNhNPAN3IbvBC3c6qpt0dLsWvGYW2IQTTnI71r/YY1XN/mTa4t/zwI+/kghjMQIDAQABoxAwDjAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4ICAQBJUMBYJXnNihlGA2NMFIZMlsnW+5tjUqqK/Pv+oSptrqZxwDKFZL0NMxd4pVnLxIdU5HEcN2e01Xyqlaf5Tm3BZN6MaRVZAIRVfvxcNESQYA0jSFjsJzZUFGIQf8P9a5u+7qqSmj4tZx4XaRjOGSOf8t2RMJDmAbUeydLiD8nyCcxTzetmyYky8J3NBUoYGRbwU6KKbkxHbT35QheAb3jT4CELopLZ57Aa5Fb8xTjQ6tNqwZ+Z3993FkTOWPYLNLM1l46oN3g9yVY4ncGjUJkxsLTpAXB4I+wdqeew9XXexWNcY3cWWjA5VXgCNzntkPFM1D5IWkgP8MYVCvdv0Unfo78PahwVMoQMnDG4xLuS50gVKpukHLZQJNFPF0X4u/JeXauKPv/w7ssTTAK+8RIBYxBXQ72zDJNHyTqldR4efPHZfcW7OTmUr5FGNZThyW7ipvZRWcLM4u4IaWF2ncllOSqAXs1gDxkk201J7LrboZOjC3zgxE9HTCXpiszOAt5I38++5ufE3/hJW3ckz0jaJDeFqUphnn8eQhXPSwtCR8TL4ZpXSAFEpwahG+fCfZDK2KyPME33eXV3jtsYf0QHerYiMnP+tf1vAk3qtOzoE6Iv16fpBUvshk1Gm6E6bdhsP0hCrMwV4dm8uC3S52qcFiWZ6AC/HURaMbY+/lOs0A==
-----END CERTIFICATE-----""",
        description="Casdoor public key for JWT signature verification",
    )
    Issuer: str = Field(
        default="http://host.docker.internal:8000",
        description="Casdoor service address",
    )
    JwksUri: str | None = Field(
        default="http://host.docker.internal:8000/.well-known/jwks",
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


class BohriumAuthConfig(AuthProviderConfigBase):
    """Bohrium 认证配置"""

    PublicKey: str | None = Field(
        default="""-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnn3jPyW81YqSjSLWBkdE
ZzurZ5gimj6Db693bO0WvhMPABpYdOTeAU1mnQh2ep4H7zoUdz4PKARh/p5Meh6l
ejtbyliptvW9WXg5LoquIzPyTe5/2W9GoTrzDHMdM89Gc2dn16TbsKU5z3lROlBP
Q2v7UjQCbs8VpSogb44kOn0cx/MV2+VBfJzFWkJnaXxc101YUteJytJRMli0Wqev
nYqzCgrtbdvqVF/8hqETZOIWdWlhRDASdYw3R08rChcMJ9ucZL/VUM+aKu+feekQ
UZ6Bi6CeZjgqBoiwccApVR88WbyVXWR/3IFvJb0ndoSdH85klpp25yVAHTdSIDZP
lQIDAQAB
-----END PUBLIC KEY-----""",
        description="Bohrium client public key for JWT signature verification",
    )
    Issuer: str = Field(
        default="https://host.docker.internal:8000",
        description="Bohrium service address",
    )
    JwksUri: str | None = Field(
        default="http://localhost:7000/.well-known/jwks",
        description="Bohrium Does not provide JWKS, this is an example",
    )
    Algorithm: str = Field(
        default="RS256",
        description="Encryption algorithm used for authentication, typically RS256",
    )
    Audience: str = Field(
        default="your-bohrium-client-id",
        description="Bohrium application Client ID",
    )


class BohrAppAuthConfig(AuthProviderConfigBase):
    """BohrApp 认证配置"""

    PublicKey: str | None = Field(
        default=None,
        description="Bohr App does not use public key (placeholder for consistency)",
    )

    Issuer: str = Field(
        default="https://openapi.dp.tech/openapi/v1/ak/user",
        description="Bohr App user info endpoint",
    )

    JwksUri: str | None = Field(
        default=None,
        description="Bohr App does not provide JWKS endpoint",
    )

    Algorithm: str = Field(
        default="RS256",
        description="Encryption algorithm used for authentication, typically RS256",
    )

    Audience: str = Field(
        default="your-bohrapp-client-id",
        description="Bohr App application Client ID",
    )


class AuthProvider(str, Enum):
    """Authentication provider types"""

    CASDOOR = "casdoor"
    BOHRIUM = "bohrium"
    BOHRAPP = "bohr_app"


class AuthConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="forbid",
    )

    Provider: AuthProvider = Field(default=AuthProvider.CASDOOR, description="Authentication provider")

    Casdoor: CasdoorAuthConfig = Field(
        default_factory=lambda: CasdoorAuthConfig(),
        description="Casdoor authentication configuration",
    )

    Bohrium: BohriumAuthConfig = Field(
        default_factory=lambda: BohriumAuthConfig(),
        description="Bohrium authentication configuration",
    )

    BohrApp: BohrAppAuthConfig = Field(
        default_factory=lambda: BohrAppAuthConfig(),
        description="Bohr App authentication configuration",
    )
