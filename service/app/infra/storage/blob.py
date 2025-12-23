import logging
import mimetypes
import os
from typing import Any, BinaryIO, TypedDict

import aioboto3
from botocore.exceptions import ClientError

from app.common.code import ErrCode
from app.common.configs import configs
from app.core.storage import StorageServiceProto

logger = logging.getLogger(__name__)


class S3Config(TypedDict):
    service_name: str
    endpoint_url: str
    aws_access_key_id: str
    aws_secret_access_key: str
    use_ssl: bool
    region_name: str


class BlobStorageService(StorageServiceProto):
    """
    Blob storage service for managing files in object storage (S3-compatible).

    Supports MinIO, AWS S3, Aliyun OSS, and other S3-compatible services.
    """

    def __init__(self):
        self.session = aioboto3.Session()

        self.s3_config: S3Config = {
            "service_name": "s3",
            "endpoint_url": configs.OSS.Endpoint,
            "aws_access_key_id": configs.OSS.AccessKey,
            "aws_secret_access_key": configs.OSS.SecretKey,
            "use_ssl": configs.OSS.Secure,
            "region_name": configs.OSS.Region,
        }
        self.bucket = configs.OSS.BucketName

    async def initialize(self) -> None:
        """
        Initialize the storage service and ensure bucket exists.

        Raises:
            ErrCodeError: If bucket creation or configuration fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                try:
                    await s3.head_bucket(Bucket=self.bucket)
                    logger.info(f"Bucket '{self.bucket}' already exists")
                except ClientError as e:
                    error_code = e.response.get("Error", {}).get("Code")
                    if error_code == "404":
                        logger.info(f"Creating bucket '{self.bucket}'")
                        await s3.create_bucket(Bucket=self.bucket)
                        logger.info(f"Bucket '{self.bucket}' created successfully")
                    else:
                        raise ErrCode.OSS_BUCKET_ACCESS_DENIED.with_errors(e)
        except ClientError as e:
            logger.error(f"Failed to initialize storage: {e}")
            raise ErrCode.OSS_CONFIGURATION_ERROR.with_errors(e)

    async def upload_file(
        self,
        file_data: BinaryIO,
        storage_key: str,
        content_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """
        Upload a file to object storage.

        Args:
            file_data: File binary data
            storage_key: Storage key/path for the file
            content_type: MIME type of the file (auto-detected if not provided)
            metadata: Additional metadata for the file

        Returns:
            The storage key of the uploaded file

        Raises:
            ErrCodeError: If upload fails
        """
        try:
            # Auto-detect content type if not provided
            if content_type is None:
                content_type, _ = mimetypes.guess_type(storage_key)
                if content_type is None:
                    content_type = "application/octet-stream"

            # Prepare extra args
            extra_args: dict[str, Any] = {"ContentType": content_type}
            if metadata:
                extra_args["Metadata"] = metadata

            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                await s3.upload_fileobj(
                    file_data,
                    self.bucket,
                    storage_key,
                    ExtraArgs=extra_args,
                )

            logger.info(f"File uploaded successfully: {storage_key}")
            return storage_key

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.error(f"Failed to upload file {storage_key}: {e}")

            if error_code == "NoSuchBucket":
                raise ErrCode.OSS_BUCKET_NOT_FOUND.with_errors(e)
            elif error_code == "AccessDenied":
                raise ErrCode.OSS_BUCKET_ACCESS_DENIED.with_errors(e)
            else:
                raise ErrCode.OSS_UPLOAD_FAILED.with_errors(e)

    async def upload_file_from_path(
        self,
        file_path: str,
        storage_key: str,
        content_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """
        Upload a file from local path to object storage.

        Args:
            file_path: Local file path
            storage_key: Storage key/path for the file
            content_type: MIME type of the file (auto-detected if not provided)
            metadata: Additional metadata for the file

        Returns:
            The storage key of the uploaded file

        Raises:
            ErrCodeError: If upload fails
        """
        try:
            with open(file_path, "rb") as f:
                return await self.upload_file(f, storage_key, content_type, metadata)
        except FileNotFoundError as e:
            logger.error(f"File not found: {file_path}")
            raise ErrCode.FILE_NOT_FOUND.with_errors(e)
        except Exception as e:
            logger.error(f"Failed to upload file from path {file_path}: {e}")
            raise ErrCode.OSS_UPLOAD_FAILED.with_errors(e)

    async def download_file(self, storage_key: str, destination: BinaryIO) -> None:
        """
        Download a file from object storage.

        Args:
            storage_key: Storage key of the file
            destination: File-like object to write to

        Raises:
            ErrCodeError: If download fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                await s3.download_fileobj(self.bucket, storage_key, destination)

            logger.info(f"File downloaded successfully: {storage_key}")

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.error(f"Failed to download file {storage_key}: {e}")

            if error_code == "NoSuchKey":
                raise ErrCode.OSS_OBJECT_NOT_FOUND.with_errors(e)
            elif error_code == "NoSuchBucket":
                raise ErrCode.OSS_BUCKET_NOT_FOUND.with_errors(e)
            elif error_code == "AccessDenied":
                raise ErrCode.OSS_OBJECT_ACCESS_DENIED.with_errors(e)
            else:
                raise ErrCode.OSS_DOWNLOAD_FAILED.with_errors(e)

    async def download_file_to_path(self, storage_key: str, file_path: str) -> None:
        """
        Download a file from object storage to local path.

        Args:
            storage_key: Storage key of the file
            file_path: Local file path to save to

        Raises:
            ErrCodeError: If download fails
        """
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            with open(file_path, "wb") as f:
                await self.download_file(storage_key, f)

        except Exception as e:
            logger.error(f"Failed to download file to path {file_path}: {e}")
            raise ErrCode.OSS_DOWNLOAD_FAILED.with_errors(e)

    async def delete_file(self, storage_key: str) -> None:
        """
        Delete a file from object storage.

        Args:
            storage_key: Storage key of the file to delete

        Raises:
            ErrCodeError: If deletion fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                await s3.delete_object(Bucket=self.bucket, Key=storage_key)

            logger.info(f"File deleted successfully: {storage_key}")

        except ClientError as e:
            logger.error(f"Failed to delete file {storage_key}: {e}")
            raise ErrCode.OSS_DELETE_FAILED.with_errors(e)

    async def delete_files(self, storage_keys: list[str]) -> None:
        """
        Delete multiple files from object storage.

        Args:
            storage_keys: List of storage keys to delete

        Raises:
            ErrCodeError: If deletion fails
        """
        if not storage_keys:
            return

        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                objects = [{"Key": key} for key in storage_keys]
                await s3.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": objects},
                )

            logger.info(f"Deleted {len(storage_keys)} files successfully")

        except ClientError as e:
            logger.error(f"Failed to delete multiple files: {e}")
            raise ErrCode.OSS_DELETE_FAILED.with_errors(e)

    async def file_exists(self, storage_key: str) -> bool:
        """
        Check if a file exists in object storage.

        Args:
            storage_key: Storage key to check

        Returns:
            True if file exists, False otherwise
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                await s3.head_object(Bucket=self.bucket, Key=storage_key)
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == "404":
                return False
            logger.error(f"Error checking file existence {storage_key}: {e}")
            return False

    async def get_file_metadata(self, storage_key: str) -> dict[str, Any]:
        """
        Get metadata for a file in object storage.

        Args:
            storage_key: Storage key of the file

        Returns:
            Dictionary containing file metadata

        Raises:
            ErrCodeError: If operation fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                response = await s3.head_object(Bucket=self.bucket, Key=storage_key)

            return {
                "content_type": response.get("ContentType"),
                "content_length": response.get("ContentLength"),
                "last_modified": response.get("LastModified"),
                "etag": response.get("ETag"),
                "metadata": response.get("Metadata", {}),
            }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.error(f"Failed to get metadata for {storage_key}: {e}")

            if error_code == "NoSuchKey":
                raise ErrCode.OSS_OBJECT_NOT_FOUND.with_errors(e)
            elif error_code == "AccessDenied":
                raise ErrCode.OSS_OBJECT_ACCESS_DENIED.with_errors(e)
            else:
                raise ErrCode.OSS_METADATA_ERROR.with_errors(e)

    async def generate_presigned_url(
        self,
        storage_key: str,
        expires_in: int = 3600,
        method: str = "get_object",
    ) -> str:
        """
        Generate a pre-signed URL for temporary access to a file.

        Args:
            storage_key: Storage key of the file
            expires_in: URL expiration time in seconds (default: 1 hour)
            method: S3 method ('get_object' for download, 'put_object' for upload)

        Returns:
            Pre-signed URL string

        Raises:
            ErrCodeError: If URL generation fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                url = await s3.generate_presigned_url(
                    method,
                    Params={"Bucket": self.bucket, "Key": storage_key},
                    ExpiresIn=expires_in,
                )

            logger.info(f"Generated presigned URL for {storage_key}, expires in {expires_in}s")
            return url

        except ClientError as e:
            logger.error(f"Failed to generate presigned URL for {storage_key}: {e}")
            raise ErrCode.OSS_PRESIGNED_URL_INVALID.with_errors(e)

    async def generate_upload_url(self, storage_key: str, expires_in: int = 3600) -> str:
        """
        Generate a pre-signed URL for uploading a file.

        Args:
            storage_key: Storage key for the file to be uploaded
            expires_in: URL expiration time in seconds (default: 1 hour)

        Returns:
            Pre-signed upload URL
        """
        return await self.generate_presigned_url(storage_key, expires_in, "put_object")

    async def generate_download_url(self, storage_key: str, expires_in: int = 3600) -> str:
        """
        Generate a pre-signed URL for downloading a file.

        Args:
            storage_key: Storage key of the file
            expires_in: URL expiration time in seconds (default: 1 hour)

        Returns:
            Pre-signed download URL
        """
        return await self.generate_presigned_url(storage_key, expires_in, "get_object")

    async def list_files(
        self,
        prefix: str = "",
        max_keys: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        List files in object storage with optional prefix filter.

        Args:
            prefix: Prefix to filter files (e.g., 'private/images/')
            max_keys: Maximum number of keys to return

        Returns:
            List of file information dictionaries

        Raises:
            ErrCodeError: If listing fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                response = await s3.list_objects_v2(
                    Bucket=self.bucket,
                    Prefix=prefix,
                    MaxKeys=max_keys,
                )

            files: list[dict[str, Any]] = []
            for obj in response.get("Contents", []):
                files.append(
                    {
                        "key": obj["Key"],
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"],
                        "etag": obj["ETag"],
                    }
                )

            logger.info(f"Listed {len(files)} files with prefix '{prefix}'")
            return files

        except ClientError as e:
            logger.error(f"Failed to list files with prefix {prefix}: {e}")
            raise ErrCode.OSS_BUCKET_ACCESS_DENIED.with_errors(e)

    async def copy_file(self, source_key: str, destination_key: str) -> str:
        """
        Copy a file within object storage.

        Args:
            source_key: Source storage key
            destination_key: Destination storage key

        Returns:
            The destination storage key

        Raises:
            ErrCodeError: If copy fails
        """
        try:
            async with self.session.client(**self.s3_config) as s3:  # type: ignore
                copy_source = {"Bucket": self.bucket, "Key": source_key}
                await s3.copy_object(
                    CopySource=copy_source,
                    Bucket=self.bucket,
                    Key=destination_key,
                )

            logger.info(f"File copied from {source_key} to {destination_key}")
            return destination_key

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.error(f"Failed to copy file from {source_key} to {destination_key}: {e}")

            if error_code == "NoSuchKey":
                raise ErrCode.OSS_OBJECT_NOT_FOUND.with_errors(e)
            elif error_code == "AccessDenied":
                raise ErrCode.OSS_OBJECT_ACCESS_DENIED.with_errors(e)
            else:
                raise ErrCode.OSS_UPLOAD_FAILED.with_errors(e)
