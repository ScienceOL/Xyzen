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
    MaxUserStorageBytes: int = Field(
        default=1024 * 1024 * 1024,  # 1GB default
        description="Maximum storage per user in bytes",
    )
    MaxFileUploadBytes: int = Field(
        default=100 * 1024 * 1024,  # 100MB default
        description="Maximum single file upload size in bytes",
    )
    MaxUserFileCount: int = Field(
        default=10000,
        description="Maximum number of files per user",
    )
