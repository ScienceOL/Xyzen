"""
Tests for ImageFetcher service.
"""

import base64
import io
from unittest.mock import MagicMock, patch


from app.tools.utils.documents.image_fetcher import (
    DEFAULT_TIMEOUT,
    MAX_IMAGE_DIMENSION,
    MAX_IMAGE_SIZE_BYTES,
    FetchedImage,
    ImageFetcher,
)


class TestFetchedImage:
    def test_success_result(self) -> None:
        result = FetchedImage(
            success=True,
            data=b"image_data",
            format="png",
            width=100,
            height=100,
        )
        assert result.success
        assert result.data == b"image_data"
        assert result.error is None

    def test_failure_result(self) -> None:
        result = FetchedImage(success=False, error="Connection failed")
        assert not result.success
        assert result.error == "Connection failed"
        assert result.data is None


class TestImageFetcher:
    def test_init_defaults(self) -> None:
        fetcher = ImageFetcher()
        assert fetcher.timeout == DEFAULT_TIMEOUT
        assert fetcher.max_size_bytes == MAX_IMAGE_SIZE_BYTES
        assert fetcher.max_dimension == MAX_IMAGE_DIMENSION

    def test_init_custom_values(self) -> None:
        fetcher = ImageFetcher(timeout=10.0, max_size_bytes=1000, max_dimension=500)
        assert fetcher.timeout == 10.0
        assert fetcher.max_size_bytes == 1000
        assert fetcher.max_dimension == 500

    def test_unsupported_scheme(self) -> None:
        fetcher = ImageFetcher()
        result = fetcher.fetch("ftp://example.com/image.png")
        assert not result.success
        assert "Unsupported URL scheme" in (result.error or "")


class TestImageFetcherHTTP:
    @patch("httpx.Client")
    def test_fetch_http_success(self, mock_client_cls: MagicMock) -> None:
        # Create a minimal valid PNG (1x1 pixel)
        png_data = self._create_minimal_png()

        mock_response = MagicMock()
        mock_response.content = png_data
        mock_response.headers = {"content-length": str(len(png_data))}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        fetcher = ImageFetcher()
        result = fetcher.fetch("https://example.com/image.png")

        assert result.success
        assert result.data is not None
        assert result.format == "png"
        mock_client.get.assert_called_once_with("https://example.com/image.png")

    @patch("httpx.Client")
    def test_fetch_http_timeout(self, mock_client_cls: MagicMock) -> None:
        import httpx

        mock_client = MagicMock()
        mock_client.get.side_effect = httpx.TimeoutException("timeout")
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        fetcher = ImageFetcher()
        result = fetcher.fetch("https://example.com/image.png")

        assert not result.success
        assert "Timeout" in (result.error or "")

    @patch("httpx.Client")
    def test_fetch_http_status_error(self, mock_client_cls: MagicMock) -> None:
        import httpx

        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = MagicMock()
        mock_client.get.side_effect = httpx.HTTPStatusError("Not found", request=MagicMock(), response=mock_response)
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        fetcher = ImageFetcher()
        result = fetcher.fetch("https://example.com/image.png")

        assert not result.success
        assert "404" in (result.error or "")

    @patch("httpx.Client")
    def test_fetch_http_too_large_header(self, mock_client_cls: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.headers = {"content-length": str(MAX_IMAGE_SIZE_BYTES + 1)}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        fetcher = ImageFetcher()
        result = fetcher.fetch("https://example.com/large.png")

        assert not result.success
        assert "too large" in (result.error or "").lower()

    @patch("httpx.Client")
    def test_fetch_http_too_large_content(self, mock_client_cls: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.headers = {}  # No content-length header
        mock_response.content = b"x" * (MAX_IMAGE_SIZE_BYTES + 1)
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_cls.return_value = mock_client

        fetcher = ImageFetcher()
        result = fetcher.fetch("https://example.com/large.png")

        assert not result.success
        assert "too large" in (result.error or "").lower()

    def _create_minimal_png(self) -> bytes:
        """Create a minimal valid 1x1 PNG image."""
        from PIL import Image

        img = Image.new("RGB", (1, 1), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()


class TestImageFetcherBase64:
    def test_fetch_base64_valid_png(self) -> None:
        # Create a minimal valid PNG
        from PIL import Image

        img = Image.new("RGB", (10, 10), color="blue")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        b64_data = base64.b64encode(png_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64_data}"

        fetcher = ImageFetcher()
        result = fetcher.fetch(data_url)

        assert result.success
        assert result.data is not None
        assert result.format == "png"
        assert result.width == 10
        assert result.height == 10

    def test_fetch_base64_valid_jpeg(self) -> None:
        from PIL import Image

        img = Image.new("RGB", (20, 15), color="green")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        jpeg_bytes = buffer.getvalue()

        b64_data = base64.b64encode(jpeg_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64_data}"

        fetcher = ImageFetcher()
        result = fetcher.fetch(data_url)

        assert result.success
        assert result.format in ("jpg", "jpeg")
        assert result.width == 20
        assert result.height == 15

    def test_fetch_base64_invalid_format(self) -> None:
        fetcher = ImageFetcher()
        result = fetcher.fetch("data:text/plain;base64,SGVsbG8=")
        assert not result.success
        assert "Invalid" in (result.error or "")

    def test_fetch_base64_invalid_data(self) -> None:
        fetcher = ImageFetcher()
        result = fetcher.fetch("data:image/png;base64,invalid!!data")
        assert not result.success
        # Either decode error or image processing error
        assert result.error is not None

    def test_fetch_base64_too_large(self) -> None:
        from PIL import Image

        # Create an image that exceeds the limit when decoded
        img = Image.new("RGB", (100, 100), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        b64_data = base64.b64encode(png_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64_data}"

        # Use a small limit to trigger the check
        fetcher = ImageFetcher(max_size_bytes=100)
        result = fetcher.fetch(data_url)

        assert not result.success
        assert "too large" in (result.error or "").lower()


class TestImageFetcherResize:
    def test_resize_large_image(self) -> None:
        from PIL import Image

        # Create an image larger than max dimension
        large_size = MAX_IMAGE_DIMENSION + 500
        img = Image.new("RGB", (large_size, large_size // 2), color="purple")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        b64_data = base64.b64encode(png_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64_data}"

        fetcher = ImageFetcher()
        result = fetcher.fetch(data_url)

        assert result.success
        # Image should be resized
        assert result.width is not None
        assert result.height is not None
        assert result.width <= MAX_IMAGE_DIMENSION
        assert result.height <= MAX_IMAGE_DIMENSION

    def test_no_resize_small_image(self) -> None:
        from PIL import Image

        small_size = 100
        img = Image.new("RGB", (small_size, small_size), color="yellow")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        b64_data = base64.b64encode(png_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64_data}"

        fetcher = ImageFetcher()
        result = fetcher.fetch(data_url)

        assert result.success
        assert result.width == small_size
        assert result.height == small_size


class TestImageFetcherStorage:
    @patch("app.core.storage.get_storage_service")
    def test_fetch_from_storage_success(self, mock_get_storage: MagicMock) -> None:
        from PIL import Image

        # Create test image
        img = Image.new("RGB", (50, 50), color="cyan")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        # Mock storage service
        mock_storage = MagicMock()

        async def mock_download(key: str, output_buffer: io.BytesIO) -> None:
            output_buffer.write(png_bytes)

        mock_storage.download_file = mock_download
        mock_get_storage.return_value = mock_storage

        fetcher = ImageFetcher()
        result = fetcher.fetch("storage://path/to/image.png")

        assert result.success
        assert result.width == 50
        assert result.height == 50

    @patch("app.core.storage.get_storage_service")
    def test_fetch_from_storage_failure(self, mock_get_storage: MagicMock) -> None:
        mock_storage = MagicMock()

        async def mock_download(key: str, output_buffer: io.BytesIO) -> None:
            raise FileNotFoundError("File not found")

        mock_storage.download_file = mock_download
        mock_get_storage.return_value = mock_storage

        fetcher = ImageFetcher()
        result = fetcher.fetch("storage://path/to/missing.png")

        assert not result.success
        assert "Storage fetch failed" in (result.error or "")


class TestImageFetcherByImageId:
    """Tests for fetching images by image_id (UUID)."""

    def test_fetch_invalid_uuid_format(self) -> None:
        """Test that invalid UUID format returns error."""
        fetcher = ImageFetcher()
        result = fetcher.fetch(image_id="not-a-valid-uuid")

        assert not result.success
        assert "Invalid image_id format" in (result.error or "")

    def test_fetch_requires_url_or_image_id(self) -> None:
        """Test that fetch fails when neither url nor image_id is provided."""
        fetcher = ImageFetcher()
        result = fetcher.fetch()

        assert not result.success
        assert "Either url or image_id must be provided" in (result.error or "")

    def test_fetch_with_url_still_works(self) -> None:
        """Test that fetch with url parameter still works (backward compat)."""
        from PIL import Image

        # Create a minimal valid PNG
        img = Image.new("RGB", (10, 10), color="blue")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()

        b64_data = base64.b64encode(png_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64_data}"

        fetcher = ImageFetcher()
        # Test with keyword argument url=
        result = fetcher.fetch(url=data_url)

        assert result.success
        assert result.format == "png"
        assert result.width == 10

    def test_fetch_by_image_id_returns_resolution_error(self) -> None:
        """Test that image_id returns error about needing resolution in async layer."""
        from uuid import uuid4

        fetcher = ImageFetcher()
        test_uuid = str(uuid4())
        result = fetcher.fetch(image_id=test_uuid)

        assert not result.success
        # Should explain that image_id needs to be resolved in async layer
        assert "not resolved" in (result.error or "").lower() or "async layer" in (result.error or "").lower()
