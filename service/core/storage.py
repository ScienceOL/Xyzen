import logging
import uuid
from datetime import datetime
from enum import StrEnum

import aioboto3

from internal.configs import OSSConfig

logger = logging.getLogger(__name__)


class FileScope(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"
    GENERATED = "generated"


class FileCategory(StrEnum):
    IMAGE = "images"
    DOCUMENT = "documents"
    AUDIO = "audio"
    OTHER = "others"


def generate_storage_key(user_id: str, filename: str, scope: FileScope = FileScope.PRIVATE) -> str:
    """
    生成标准化的存储路径 (Key)。
    格式: {scope}/{user_id}/{year}/{month}/{uuid}.{ext}
    例如: private/user_123/2025/12/550e8400-e29b-41d4-a716-446655440000.png
    """
    # 1. 提取或清理扩展名
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"

    # 2. 生成唯一文件名，防止覆盖和中文乱码
    unique_name = f"{uuid.uuid4()}.{ext}"

    # 3. 时间维度分片，避免单目录下文件过多
    now = datetime.utcnow()
    year = now.strftime("%Y")
    month = now.strftime("%m")

    return f"{scope.value}/{user_id}/{year}/{month}/{unique_name}"


# Outputs:
#  [{'col1': 'some_data', 'pk': 'test1'}]
class BlobStorageService:
    def __init__(self):
        self.session = aioboto3.Session()

        self.s3_config = {
            "service_name": "s3",
            "endpoint_url": OSSConfig.Endpoint,
            "aws_access_key_id": OSSConfig.AccessKey,
            "aws_secret_access_key": OSSConfig.SecretKey,
            "use_ssl": OSSConfig.Secure,
            "region_name": OSSConfig.Region,
        }
        self.bucket = OSSConfig.BucketName

    # async def upload_file(
    #     self, file_obj: BinaryIO, object_key: str, content_type: str = "application/octet-stream"
    # ) -> str:
    #     """
    #     流式上传文件到 MinIO
    #     :param file_obj: 文件对象 (BytesIO 或 UploadFile.file)
    #     :param object_key: 完整的存储路径 (由 utils.generate_storage_key 生成)
    #     :param content_type: MIME 类型
    #     :return: object_key
    #     """
    #     try:
    #         async with self.session.client(**self.s3_config) as client:
    #             # 检查桶是否存在，不存在则创建 (可选，建议在部署脚本中完成桶创建)
    #             # await self._ensure_bucket_exists(client)

    #             await client.upload_fileobj(file_obj, self.bucket, object_key, ExtraArgs={"ContentType": content_type})
    #             logger.info(f"File uploaded successfully: {object_key}")
    #             return object_key

    #     except (ClientError, EndpointConnectionError) as e:
    #         logger.error(f"S3 Upload Failed: {str(e)}")
    #         raise ServiceException(f"Failed to upload file to storage: {str(e)}")

    # async def get_presigned_url(self, object_key: str, expiration: int = settings.PRESIGNED_URL_EXPIRE_SECONDS) -> str:
    #     """
    #     生成临时访问链接 (Presigned URL)
    #     """
    #     try:
    #         async with self.session.client(**self.s3_config) as client:
    #             url = await client.generate_presigned_url(
    #                 ClientMethod="get_object", Params={"Bucket": self.bucket, "Key": object_key}, ExpiresIn=expiration
    #             )
    #             return url
    #     except ClientError as e:
    #         logger.error(f"Failed to generate presigned URL for {object_key}: {str(e)}")
    #         raise ServiceException("Could not generate access URL")

    # async def delete_file(self, object_key: str) -> bool:
    #     """
    #     删除文件
    #     """
    #     try:
    #         async with self.session.client(**self.s3_config) as client:
    #             await client.delete_object(Bucket=self.bucket, Key=object_key)
    #             logger.info(f"File deleted: {object_key}")
    #             return True
    #     except ClientError as e:
    #         logger.error(f"Failed to delete file {object_key}: {str(e)}")
    #         return False

    # async def check_file_exists(self, object_key: str) -> bool:
    #     """
    #     检查文件是否存在 (Head Object)
    #     """
    #     try:
    #         async with self.session.client(**self.s3_config) as client:
    #             await client.head_object(Bucket=self.bucket, Key=object_key)
    #             return True
    #     except ClientError:
    #         return False

    # async def download_file_to_memory(self, object_key: str) -> bytes:
    #     """
    #     (高级功能) 将文件下载到内存中 (主要用于 Agent 需要处理图片内容的场景)
    #     注意：仅适用于小文件！
    #     """
    #     try:
    #         async with self.session.client(**self.s3_config) as client:
    #             response = await client.get_object(Bucket=self.bucket, Key=object_key)
    #             async with response["Body"] as stream:
    #                 return await stream.read()
    #     except ClientError as e:
    #         logger.error(f"Download failed: {str(e)}")
    #         raise ServiceException("Failed to download file content")
