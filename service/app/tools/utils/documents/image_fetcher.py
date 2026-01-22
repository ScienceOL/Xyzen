"""
Image fetching service for document generation.

Handles HTTP URLs, base64 data URLs, and storage:// protocol.
Designed for synchronous use in document handlers.
"""

from __future__ import annotations

import base64
import io
import logging
import re
from dataclasses import dataclass
from typing import Any, Coroutine, TypeVar

import httpx
from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# Constants
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_DIMENSION = 4096  # pixels
DEFAULT_TIMEOUT = 30.0

T = TypeVar("T")


def _run_async(coro: Coroutine[Any, Any, T]) -> T:
    """
    Run an async coroutine from sync code, handling existing event loops.

    When called from within an already-running event loop (e.g., Celery worker),
    asyncio.run() fails. This helper uses a thread pool to safely execute
    async code in such cases.
    """
    import asyncio
    import concurrent.futures

    try:
        # Check if there's already a running event loop
        asyncio.get_running_loop()
        # We're in an async context - run in a thread pool
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()
    except RuntimeError:
        # No running loop - safe to use asyncio.run
        return asyncio.run(coro)


@dataclass
class FetchedImage:
    """Result of an image fetch operation."""

    success: bool
    data: bytes | None = None
    format: str | None = None  # "png", "jpeg", etc.
    width: int | None = None
    height: int | None = None
    error: str | None = None


class ImageFetcher:
    """
    Fetches images from various sources for document embedding.

    Supports:
    - HTTP/HTTPS URLs
    - Base64 data URLs (data:image/png;base64,...)
    - storage:// protocol (internal file storage)
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        max_size_bytes: int = MAX_IMAGE_SIZE_BYTES,
        max_dimension: int = MAX_IMAGE_DIMENSION,
    ):
        self.timeout = timeout
        self.max_size_bytes = max_size_bytes
        self.max_dimension = max_dimension

    def fetch(self, url: str | None = None, image_id: str | None = None) -> FetchedImage:
        """
        Fetch an image from the given URL or resolve image_id to storage.

        Args:
            url: HTTP URL, base64 data URL, or storage:// URL (takes precedence if provided)
            image_id: UUID of a generated image from generate_image tool (fallback if no url)

        Returns:
            FetchedImage with data or error information
        """
        try:
            # Prefer URL over image_id when both are present
            # This allows the async layer to resolve image_ids to URLs beforehand
            if url:
                if url.startswith("data:"):
                    return self._fetch_base64(url)
                elif url.startswith("storage://"):
                    return self._fetch_from_storage(url)
                elif url.startswith(("http://", "https://")):
                    return self._fetch_http(url)
                else:
                    return FetchedImage(success=False, error=f"Unsupported URL scheme: {url[:50]}")
            elif image_id:
                # Fallback to image_id if no URL provided
                return self._fetch_by_image_id(image_id)
            else:
                return FetchedImage(success=False, error="Either url or image_id must be provided")
        except Exception as e:
            logger.error(f"Image fetch failed: {e}")
            return FetchedImage(success=False, error=str(e))

    def _fetch_http(self, url: str) -> FetchedImage:
        """Fetch image from HTTP/HTTPS URL."""
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                response = client.get(url)
                response.raise_for_status()

                # Check size from header
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > self.max_size_bytes:
                    return FetchedImage(
                        success=False,
                        error=f"Image too large: {int(content_length)} bytes (max {self.max_size_bytes})",
                    )

                data = response.content
                if len(data) > self.max_size_bytes:
                    return FetchedImage(
                        success=False,
                        error=f"Image too large: {len(data)} bytes (max {self.max_size_bytes})",
                    )

                return self._process_image_data(data)

        except httpx.TimeoutException:
            return FetchedImage(success=False, error=f"Timeout fetching image: {url[:100]}")
        except httpx.HTTPStatusError as e:
            return FetchedImage(success=False, error=f"HTTP error {e.response.status_code}: {url[:100]}")
        except httpx.RequestError as e:
            return FetchedImage(success=False, error=f"Request error: {e}")

    def _fetch_base64(self, data_url: str) -> FetchedImage:
        """Decode base64 data URL."""
        # Format: data:image/png;base64,<data>
        match = re.match(r"data:image/(\w+);base64,(.+)", data_url, re.DOTALL)
        if not match:
            return FetchedImage(success=False, error="Invalid base64 data URL format")

        format_hint = match.group(1).lower()
        b64_data = match.group(2)

        try:
            data = base64.b64decode(b64_data)
        except Exception as e:
            return FetchedImage(success=False, error=f"Base64 decode failed: {e}")

        if len(data) > self.max_size_bytes:
            return FetchedImage(
                success=False,
                error=f"Image too large: {len(data)} bytes (max {self.max_size_bytes})",
            )

        return self._process_image_data(data, format_hint)

    def _fetch_from_storage(self, storage_url: str) -> FetchedImage:
        """
        Fetch image from internal storage.

        Uses _run_async to execute async storage download in sync context.
        """
        from app.core.storage import get_storage_service

        # Extract storage key: storage://path/to/file.png -> path/to/file.png
        storage_key = storage_url.replace("storage://", "")

        try:
            storage = get_storage_service()
            buffer = io.BytesIO()

            # Run async download in sync context
            _run_async(storage.download_file(storage_key, buffer))

            data = buffer.getvalue()
            if len(data) > self.max_size_bytes:
                return FetchedImage(
                    success=False,
                    error=f"Image too large: {len(data)} bytes (max {self.max_size_bytes})",
                )

            return self._process_image_data(data)

        except Exception as e:
            return FetchedImage(success=False, error=f"Storage fetch failed: {e}")

    def _fetch_by_image_id(self, image_id: str) -> FetchedImage:
        """
        Handle image_id parameter.

        Image IDs should be resolved to storage URLs in the async layer (operations.py)
        before reaching this sync code. If this method is called, it means the proper
        flow wasn't followed.

        For backward compatibility, we return a clear error message.
        """
        from uuid import UUID

        # Validate UUID format first
        try:
            UUID(image_id)
        except ValueError:
            return FetchedImage(success=False, error=f"Invalid image_id format: {image_id}")

        # Return error explaining the proper flow
        return FetchedImage(
            success=False,
            error=(
                f"image_id '{image_id}' was not resolved to a storage URL. "
                "Image IDs must be resolved in the async layer before document generation. "
                "Use knowledge_write tool which handles this automatically."
            ),
        )

    def _process_image_data(self, data: bytes, format_hint: str | None = None) -> FetchedImage:
        """
        Process raw image data: validate, get dimensions, optionally resize.
        """
        try:
            img = PILImage.open(io.BytesIO(data))

            # Get actual format
            img_format = (img.format or format_hint or "PNG").lower()
            if img_format == "jpeg":
                img_format = "jpg"

            width, height = img.size

            # Resize if too large
            if width > self.max_dimension or height > self.max_dimension:
                ratio = min(self.max_dimension / width, self.max_dimension / height)
                new_width = int(width * ratio)
                new_height = int(height * ratio)
                img = img.resize((new_width, new_height), PILImage.Resampling.LANCZOS)
                width, height = new_width, new_height

                # Re-encode
                output = io.BytesIO()
                save_format = "PNG" if img_format == "png" else "JPEG"
                if img.mode in ("RGBA", "P") and save_format == "JPEG":
                    img = img.convert("RGB")
                img.save(output, format=save_format)
                data = output.getvalue()

            return FetchedImage(
                success=True,
                data=data,
                format=img_format,
                width=width,
                height=height,
            )

        except Exception as e:
            return FetchedImage(success=False, error=f"Image processing failed: {e}")


__all__ = ["ImageFetcher", "FetchedImage", "MAX_IMAGE_SIZE_BYTES", "MAX_IMAGE_DIMENSION", "DEFAULT_TIMEOUT"]
