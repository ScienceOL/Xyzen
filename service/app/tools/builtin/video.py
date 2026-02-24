"""
Video Tools

LangChain tools for video generation using Google Veo via the GenAI SDK.
These tools require runtime context (user_id) to function for storage access.

Uses the google.genai SDK directly (no LangChain wrapper for Veo).
Vertex AI stores generated videos in GCS; we download from GCS and
re-upload to our MinIO storage for serving.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
from typing import Any, Literal
from uuid import uuid4

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.configs.video import get_video_config
from app.core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service

logger = logging.getLogger(__name__)


# --- Input Schemas ---


class GenerateVideoInput(BaseModel):
    """Input schema for generate_video tool."""

    prompt: str = Field(
        description=(
            "Detailed description of the video to generate. "
            "Be specific about motion, camera angles, lighting, style, and subject matter."
        )
    )
    aspect_ratio: Literal["16:9", "9:16"] = Field(
        default="16:9",
        description="Aspect ratio of the generated video. 16:9 for landscape, 9:16 for portrait.",
    )
    duration_seconds: Literal["4", "6", "8"] = Field(
        default="6",
        description="Duration of the generated video in seconds. Must be 4, 6, or 8.",
    )
    image_id: str = Field(
        default="",
        description=(
            "Optional image UUID to use as the first frame for image-to-video generation. "
            "Use the 'image_id' value returned from generate_image or upload tools. "
            "Leave empty if not using image-to-video."
        ),
    )


# --- Vertex AI GenAI Client ---

# Maximum time to wait for video generation (minutes)
_MAX_POLL_DURATION_SECONDS = 10 * 60  # 10 minutes
_POLL_INTERVAL_SECONDS = 20


def _get_vertex_credentials() -> tuple[Any, str]:
    """Get Google Vertex AI credentials and project ID from config.

    Returns:
        Tuple of (google.oauth2.service_account.Credentials, project_id)
    """
    from google.oauth2 import service_account

    from app.configs import configs

    vertex_cfg = configs.LLM.googlevertex
    raw_key = vertex_cfg.key.get_secret_value()
    if not raw_key:
        raise ValueError("Google Vertex AI key is not configured (XYZEN_LLM_GOOGLEVERTEX_KEY)")

    project = vertex_cfg.project
    if not project:
        raise ValueError("Google Vertex AI project is not configured (XYZEN_LLM_GOOGLEVERTEX_PROJECT)")

    # Decode base64 service account JSON
    sa_json = json.loads(base64.b64decode(raw_key).decode("utf-8"))

    credentials = service_account.Credentials.from_service_account_info(
        sa_json, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )

    return credentials, project


def _create_genai_client() -> Any:
    """Create a Google GenAI client configured for Vertex AI."""
    from google import genai

    credentials, project = _get_vertex_credentials()
    video_cfg = get_video_config()
    return genai.Client(
        vertexai=True,
        project=project,
        location=video_cfg.Location,
        credentials=credentials,
    )


async def _download_from_gcs(gcs_uri: str) -> bytes:
    """Download a file from GCS using the Vertex SA credentials.

    Args:
        gcs_uri: GCS URI in format gs://bucket/path/to/file

    Returns:
        File bytes
    """
    from google.cloud import storage as gcs_storage

    credentials, _ = _get_vertex_credentials()

    # Parse GCS URI: gs://bucket-name/path/to/blob
    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {gcs_uri}")
    parts = gcs_uri[5:].split("/", 1)
    bucket_name = parts[0]
    blob_path = parts[1] if len(parts) > 1 else ""

    # Run blocking GCS download in executor
    def _download() -> bytes:
        client = gcs_storage.Client(credentials=credentials)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        return blob.download_as_bytes()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _download)


# --- Video Generation Implementation ---


async def _generate_video_with_vertex(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
    image_bytes: tuple[bytes, str] | None = None,
) -> tuple[bytes, str]:
    """Generate a video using Google Veo via the GenAI SDK.

    Args:
        prompt: Text description of the video to generate
        aspect_ratio: Aspect ratio (16:9 or 9:16)
        duration_seconds: Video duration in seconds
        image_bytes: Optional (image_bytes, mime_type) for image-to-video

    Returns:
        Tuple of (video_bytes, mime_type)
    """
    from google.genai import types

    video_cfg = get_video_config()
    if not video_cfg.GCSBucket:
        raise ValueError(
            "Video generation requires a GCS bucket. Set XYZEN_VIDEO_GCSBUCKET (e.g. gs://your-bucket/videos/)"
        )

    client = _create_genai_client()

    # Build source
    source_kwargs: dict[str, Any] = {"prompt": prompt}
    if image_bytes:
        img_data, img_mime = image_bytes
        source_kwargs["image"] = types.Image(image_bytes=img_data, mime_type=img_mime)

    source = types.GenerateVideosSource(**source_kwargs)

    # Build config
    config = types.GenerateVideosConfig(
        output_gcs_uri=video_cfg.GCSBucket,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        person_generation=video_cfg.PersonGeneration,
        number_of_videos=1,
    )

    logger.info(
        f"Starting video generation: model={video_cfg.Model}, aspect_ratio={aspect_ratio}, duration={duration_seconds}s"
    )

    # Submit generation request (runs in executor since genai client is sync)
    loop = asyncio.get_running_loop()

    def _submit() -> Any:
        return client.models.generate_videos(
            model=video_cfg.Model,
            source=source,
            config=config,
        )

    operation = await loop.run_in_executor(None, _submit)

    # Poll for completion
    elapsed = 0
    while not operation.done:
        if elapsed >= _MAX_POLL_DURATION_SECONDS:
            raise TimeoutError(
                f"Video generation timed out after {_MAX_POLL_DURATION_SECONDS}s. Operation: {operation.name}"
            )
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        elapsed += _POLL_INTERVAL_SECONDS

        def _poll(op: Any) -> Any:
            return client.operations.get(operation=op)

        operation = await loop.run_in_executor(None, _poll, operation)
        logger.debug(f"Video generation poll: elapsed={elapsed}s, done={operation.done}")

    # Check for errors
    if operation.error:
        raise RuntimeError(f"Video generation failed: {operation.error}")

    # Check for RAI filtering
    result = operation.result
    if not result or not result.generated_videos:
        rai_count = getattr(result, "rai_media_filtered_count", 0) if result else 0
        rai_reasons = getattr(result, "rai_media_filtered_reasons", []) if result else []
        raise RuntimeError(f"No videos generated. RAI filtered: {rai_count}, reasons: {rai_reasons}")

    # Get video URI from result
    generated_video = result.generated_videos[0]
    video_obj = generated_video.video
    if not video_obj or not video_obj.uri:
        raise RuntimeError("Generated video has no URI")

    gcs_uri = video_obj.uri
    logger.info(f"Video generated at GCS: {gcs_uri}")

    # Download from GCS
    video_data = await _download_from_gcs(gcs_uri)
    mime_type = video_obj.mime_type or "video/mp4"

    logger.info(f"Downloaded video from GCS: {len(video_data)} bytes")
    return video_data, mime_type


async def _generate_video(
    user_id: str,
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
    image_id: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Generate a video and store it to OSS, then register in database.

    Args:
        user_id: User ID for storage organization
        prompt: Video description
        aspect_ratio: Aspect ratio for the video
        duration_seconds: Video duration in seconds
        image_id: Optional image UUID to use as first frame
        session_id: Optional session ID for sandbox mounting

    Returns:
        Dictionary with success status, video_id, URL, and metadata
    """
    try:
        # Load optional input image for image-to-video
        image_for_generation: tuple[bytes, str] | None = None
        if image_id:
            from app.tools.builtin.image import load_images_for_generation

            loaded_images = await load_images_for_generation(user_id, [image_id])
            if loaded_images:
                img_bytes, img_mime, _ = loaded_images[0]
                image_for_generation = (img_bytes, img_mime)

        # Generate video
        video_bytes, mime_type = await _generate_video_with_vertex(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            image_bytes=image_for_generation,
        )

        # Determine file extension from mime type
        ext_map = {
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "video/quicktime": ".mov",
        }
        ext = ext_map.get(mime_type, ".mp4")
        filename = f"generated_{uuid4().hex}{ext}"

        # Generate storage key
        storage_key = generate_storage_key(
            user_id=user_id,
            filename=filename,
            scope=FileScope.GENERATED,
            category=FileCategory.VIDEO,
        )

        # Upload to storage
        storage = get_storage_service()
        data = io.BytesIO(video_bytes)
        await storage.upload_file(data, storage_key, content_type=mime_type)

        # Generate accessible URL
        url = await storage.generate_download_url(storage_key, expires_in=3600 * 24 * 7)  # 7 days

        # Register file in database
        from app.infra.database import get_task_db_session
        from app.models.file import FileCreate
        from app.repos.file import FileRepository

        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            file_data = FileCreate(
                user_id=user_id,
                storage_key=storage_key,
                original_filename=filename,
                content_type=mime_type,
                file_size=len(video_bytes),
                scope=FileScope.GENERATED.value,
                category=FileCategory.VIDEO.value,
                status="confirmed",
                metainfo={
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "duration_seconds": duration_seconds,
                    "source_image_id": image_id,
                },
            )
            file_record = await file_repo.create_file(file_data)
            generated_video_id = str(file_record.id)
            await db.commit()

        logger.info(f"Generated video for user {user_id}: {storage_key} (id={generated_video_id})")

        return {
            "success": True,
            "video_id": generated_video_id,
            "path": storage_key,
            "url": url,
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "duration_seconds": duration_seconds,
            "source_image_id": image_id,
            "mime_type": mime_type,
            "size_bytes": len(video_bytes),
        }

    except Exception as e:
        logger.error(f"Video generation failed: {e}")
        return {
            "success": False,
            "error": f"Video generation failed: {e!s}",
            "prompt": prompt,
        }


# --- Tool Factory ---


def create_video_tools() -> dict[str, BaseTool]:
    """Create video tools with placeholder implementations.

    Note: Video tools require runtime context (user_id).
    The actual tool instances are created per-agent with context bound.
    This function returns template tools for the registry.

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    tools: dict[str, BaseTool] = {}

    async def generate_video_placeholder(
        prompt: str,
        aspect_ratio: str = "16:9",
        duration_seconds: str = "6",
        image_id: str = "",
    ) -> dict[str, Any]:
        return {"error": "Video tools require agent context binding", "success": False}

    tools["generate_video"] = StructuredTool(
        name="generate_video",
        description=(
            "Generate a video based on a text description using Google Veo. "
            "Provide a detailed prompt describing the desired video including motion, "
            "camera angles, lighting, style, and subject matter. "
            "Optionally pass 'image_id' to use an existing image as the first frame (image-to-video). "
            "Video generation takes 1-3 minutes. "
            "Returns a JSON result containing 'video_id' (for future reference) and 'url'."
        ),
        args_schema=GenerateVideoInput,
        coroutine=generate_video_placeholder,
    )

    return tools


def create_video_tools_for_agent(user_id: str, session_id: str | None = None) -> list[BaseTool]:
    """Create video tools bound to a specific user's context.

    This creates actual working tools with user_id captured in closures.

    Args:
        user_id: The user ID for storage organization
        session_id: Optional session ID for auto-mounting videos in sandbox

    Returns:
        List of BaseTool instances with context bound
    """
    tools: list[BaseTool] = []

    async def generate_video_bound(
        prompt: str,
        aspect_ratio: str = "16:9",
        duration_seconds: str = "6",
        image_id: str = "",
    ) -> dict[str, Any]:
        return await _generate_video(
            user_id,
            prompt,
            aspect_ratio,
            int(duration_seconds),
            image_id or None,
            session_id=session_id,
        )

    tools.append(
        StructuredTool(
            name="generate_video",
            description=(
                "Generate a video based on a text description using Google Veo. "
                "Provide a detailed prompt describing the desired video including motion, "
                "camera angles, lighting, style, and subject matter. "
                "Optionally pass 'image_id' to use an existing image as the first frame (image-to-video). "
                "Video generation takes 1-3 minutes. "
                "Returns a JSON result containing 'video_id' (for future reference) and 'url'."
            ),
            args_schema=GenerateVideoInput,
            coroutine=generate_video_bound,
        )
    )

    return tools


__all__ = [
    "create_video_tools",
    "create_video_tools_for_agent",
    "GenerateVideoInput",
]
