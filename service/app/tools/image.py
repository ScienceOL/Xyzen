"""
Image Tools

LangChain tools for image generation and reading.
These tools require runtime context (user_id) to function for storage access.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Any, Literal
from uuid import uuid4

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.configs import configs
from app.core.storage import FileScope, generate_storage_key, get_storage_service

logger = logging.getLogger(__name__)


# --- Input Schemas ---


class GenerateImageInput(BaseModel):
    """Input schema for generate_image tool."""

    prompt: str = Field(
        description="Detailed description of the image to generate. Be specific about style, composition, colors, and subject matter."
    )
    aspect_ratio: Literal["1:1", "16:9", "9:16", "4:3", "3:4"] = Field(
        default="1:1",
        description="Aspect ratio of the generated image.",
    )


class ReadImageInput(BaseModel):
    """Input schema for read_image tool."""

    path: str = Field(
        description="The storage path or URL of the image to read. Use paths returned from generate_image or other image sources."
    )


# --- Image Generation Implementation ---


async def _generate_image_with_langchain(
    prompt: str,
    aspect_ratio: str = "1:1",
) -> tuple[bytes, str]:
    """
    Generate an image using LangChain ChatGoogleGenerativeAI via ProviderManager.

    This reuses the existing ProviderManager infrastructure which handles:
    - Loading provider credentials from database
    - Setting up Google Vertex service account credentials
    - Creating properly configured LangChain model instances

    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Aspect ratio for the generated image

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    from langchain_core.messages import HumanMessage

    from app.core.providers.manager import get_user_provider_manager
    from app.infra.database import AsyncSessionLocal
    from app.schemas.provider import ProviderType

    async with AsyncSessionLocal() as db:
        # Get provider manager which loads system providers from DB
        # The "system" user_id is used since we're accessing system providers
        provider_manager = await get_user_provider_manager("system", db)

        # Create LangChain model using the factory
        # ProviderManager handles all credential setup for Google Vertex
        llm = await provider_manager.create_langchain_model(
            provider_id=ProviderType.GOOGLE_VERTEX,
            model=configs.Image.Model,
        )

    # Request image generation via LangChain
    message = HumanMessage(content=f"Generate an image with aspect ratio {aspect_ratio}: {prompt}")
    response = await llm.ainvoke([message])

    # Extract image from response content blocks
    # LangChain wraps Gemini responses - content may be string or list of blocks
    if isinstance(response.content, list):
        for block in response.content:
            # Handle dict-style blocks (most common from LangChain)
            if isinstance(block, dict):
                block_type = block.get("type")

                # Format: {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,...'}}
                if block_type == "image_url":
                    image_url_data = block.get("image_url", {})
                    if isinstance(image_url_data, dict):
                        url = image_url_data.get("url", "")
                        if isinstance(url, str) and url.startswith("data:"):
                            # Parse data URL: data:image/png;base64,<data>
                            header, b64_data = url.split(",", 1)
                            mime_type = header.split(";")[0].replace("data:", "")
                            image_bytes = base64.b64decode(b64_data)
                            return image_bytes, mime_type

                # Format: {'type': 'image', 'data': bytes, 'mime_type': '...'}
                if block_type == "image":
                    data = block.get("data")
                    if isinstance(data, bytes):
                        mime = block.get("mime_type", "image/png")
                        return data, str(mime) if mime else "image/png"

            # Check for object-style content block (e.g., pydantic models)
            elif hasattr(block, "type"):
                block_type_attr = getattr(block, "type", None)
                if block_type_attr == "image":
                    data = getattr(block, "data", None)
                    mime = getattr(block, "mime_type", "image/png")
                    if isinstance(data, bytes):
                        return data, str(mime)
                if block_type_attr == "image_url" and hasattr(block, "image_url"):
                    image_url_obj = getattr(block, "image_url", None)
                    url = getattr(image_url_obj, "url", "") if image_url_obj else ""
                    if isinstance(url, str) and url.startswith("data:"):
                        header, b64_data = url.split(",", 1)
                        mime_type = header.split(";")[0].replace("data:", "")
                        image_bytes = base64.b64decode(b64_data)
                        return image_bytes, mime_type

    raise ValueError("No image data in response. Model may not support image generation.")


async def _generate_image(user_id: str, prompt: str, aspect_ratio: str = "1:1") -> dict[str, Any]:
    """
    Generate an image and store it to OSS, then register in database.

    Args:
        user_id: User ID for storage organization
        prompt: Image description
        aspect_ratio: Aspect ratio for the image

    Returns:
        Dictionary with success status, path, URL, and metadata
    """
    try:
        # Generate image using LangChain via ProviderManager
        image_bytes, mime_type = await _generate_image_with_langchain(prompt, aspect_ratio)

        # Determine file extension from mime type
        ext_map = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
        }
        ext = ext_map.get(mime_type, ".png")
        filename = f"generated_{uuid4().hex}{ext}"

        # Generate storage key
        storage_key = generate_storage_key(
            user_id=user_id,
            filename=filename,
            scope=FileScope.GENERATED,
        )

        # Upload to storage
        storage = get_storage_service()
        data = io.BytesIO(image_bytes)
        await storage.upload_file(data, storage_key, content_type=mime_type)

        # Generate accessible URL
        url = await storage.generate_download_url(storage_key, expires_in=3600 * 24 * 7)  # 7 days

        # Register file in database so it appears in knowledge base
        from app.infra.database import AsyncSessionLocal
        from app.models.file import FileCreate
        from app.repos.file import FileRepository

        async with AsyncSessionLocal() as db:
            file_repo = FileRepository(db)
            file_data = FileCreate(
                user_id=user_id,
                storage_key=storage_key,
                original_filename=filename,
                content_type=mime_type,
                file_size=len(image_bytes),
                scope="generated",
                category="images",
                status="confirmed",
                metainfo={"prompt": prompt, "aspect_ratio": aspect_ratio},
            )
            await file_repo.create_file(file_data)
            await db.commit()

        logger.info(f"Generated image for user {user_id}: {storage_key}")

        return {
            "success": True,
            "path": storage_key,
            "url": url,
            "markdown": f"![Generated Image]({url})",
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "mime_type": mime_type,
            "size_bytes": len(image_bytes),
        }

    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        return {
            "success": False,
            "error": f"Image generation failed: {e!s}",
            "prompt": prompt,
        }


async def _read_image(path: str) -> dict[str, Any]:
    """
    Read an image from storage and return its content.

    Args:
        path: Storage path of the image

    Returns:
        Dictionary with success status, base64 content, and metadata
    """
    try:
        storage = get_storage_service()

        # Check if file exists
        if not await storage.file_exists(path):
            return {
                "success": False,
                "error": f"Image not found: {path}",
                "path": path,
            }

        # Download image
        buffer = io.BytesIO()
        await storage.download_file(path, buffer)
        image_bytes = buffer.getvalue()

        # Get metadata
        metadata = await storage.get_file_metadata(path)
        content_type = metadata.get("content_type", "image/png")

        # Encode as base64
        b64_data = base64.b64encode(image_bytes).decode("utf-8")

        logger.info(f"Read image: {path} ({len(image_bytes)} bytes)")

        return {
            "success": True,
            "path": path,
            "base64": b64_data,
            "content_type": content_type,
            "size_bytes": len(image_bytes),
            "data_url": f"data:{content_type};base64,{b64_data}",
        }

    except Exception as e:
        logger.error(f"Error reading image: {e}")
        return {
            "success": False,
            "error": f"Failed to read image: {e!s}",
            "path": path,
        }


# --- Tool Factory ---


def create_image_tools() -> dict[str, BaseTool]:
    """
    Create image tools with placeholder implementations.

    Note: Image tools require runtime context (user_id).
    The actual tool instances are created per-agent with context bound.
    This function returns template tools for the registry.

    Returns:
        Dict mapping tool_id to BaseTool placeholder instances.
    """
    tools: dict[str, BaseTool] = {}

    # Generate image tool (placeholder)
    async def generate_image_placeholder(prompt: str, aspect_ratio: str = "1:1") -> dict[str, Any]:
        return {"error": "Image tools require agent context binding", "success": False}

    tools["generate_image"] = StructuredTool(
        name="generate_image",
        description=(
            "Generate an image based on a text description. "
            "Provide a detailed prompt describing the desired image. "
            "Returns a result containing a 'markdown' field - use this field directly in your response to display the image."
        ),
        args_schema=GenerateImageInput,
        coroutine=generate_image_placeholder,
    )

    # Read image tool
    async def read_image_impl(path: str) -> dict[str, Any]:
        return await _read_image(path)

    tools["read_image"] = StructuredTool(
        name="read_image",
        description=(
            "Read an image from storage by its path. "
            "Returns the image content as base64 data. "
            "Use this to view images that were previously generated or uploaded."
        ),
        args_schema=ReadImageInput,
        coroutine=read_image_impl,
    )

    return tools


def create_image_tools_for_agent(user_id: str) -> list[BaseTool]:
    """
    Create image tools bound to a specific user's context.

    This creates actual working tools with user_id captured in closures.

    Args:
        user_id: The user ID for storage organization

    Returns:
        List of BaseTool instances with context bound
    """
    tools: list[BaseTool] = []

    # Generate image tool (bound to user)
    async def generate_image_bound(prompt: str, aspect_ratio: str = "1:1") -> dict[str, Any]:
        return await _generate_image(user_id, prompt, aspect_ratio)

    tools.append(
        StructuredTool(
            name="generate_image",
            description=(
                "Generate an image based on a text description. "
                "Provide a detailed prompt describing the desired image including style, colors, composition, and subject. "
                "Returns a result containing a 'markdown' field - use this field directly in your response to display the image to the user."
            ),
            args_schema=GenerateImageInput,
            coroutine=generate_image_bound,
        )
    )

    # Read image tool
    async def read_image_impl(path: str) -> dict[str, Any]:
        return await _read_image(path)

    tools.append(
        StructuredTool(
            name="read_image",
            description=(
                "Read an image from storage by its path. "
                "Returns the image content as base64 data that can be displayed or analyzed. "
                "Use this to view images that were previously generated or uploaded."
            ),
            args_schema=ReadImageInput,
            coroutine=read_image_impl,
        )
    )

    return tools


__all__ = [
    "create_image_tools",
    "create_image_tools_for_agent",
    "GenerateImageInput",
    "ReadImageInput",
]
