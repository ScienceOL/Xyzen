from pydantic import BaseModel, Field
from pydantic_settings import SettingsConfigDict


class OSSConfig(BaseModel):
    """OSS Settings"""

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",
    )

    Endpoint: str = Field(
        default="http://host.docker.internal:9000",
        description="MinIO endpoint",
    )
    AccessKey: str = Field(
        default="minioadmin",
        description="MinIO access key",
    )
    SecretKey: str = Field(
        default="minioadmin",
        description="MinIO secret key",
    )
    BucketName: str = Field(
        default="xyzen",
        description="MinIO bucket name",
    )
    Secure: bool = Field(
        default=False,
        description="MinIO secure",
    )
    Region: str = Field(
        default="us-east-1",
        description="MinIO region",
    )
