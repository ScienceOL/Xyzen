from pydantic import BaseModel, Field
from pydantic_settings import SettingsConfigDict


class OSSConfig(BaseModel):
    """OSS Settings"""

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",
    )

    MinIOEndpoint: str = Field(
        default="http://localhost:9000",
        description="MinIO endpoint",
    )
    MinIOAccessKey: str = Field(
        default="minioadmin",
        description="MinIO access key",
    )
    MinIOSecretKey: str = Field(
        default="minioadmin",
        description="MinIO secret key",
    )
    MinIOBucketName: str = Field(
        default="xyzen",
        description="MinIO bucket name",
    )
