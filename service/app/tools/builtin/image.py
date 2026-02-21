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
from uuid import UUID, uuid4

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field, model_validator

from app.configs import configs
from app.configs.image import get_image_config
from app.core.storage import FileScope, generate_storage_key, get_storage_service

logger = logging.getLogger(__name__)


# --- Input Schemas ---

# Maximum number of reference images allowed for generation
MAX_INPUT_IMAGES = 4


class GenerateImageInput(BaseModel):
    """Input schema for generate_image tool."""

    prompt: str = Field(
        description="Detailed description of the image to generate. Be specific about style, composition, colors, and subject matter."
    )
    aspect_ratio: Literal["1:1", "16:9", "9:16", "4:3", "3:4"] = Field(
        default="1:1",
        description="Aspect ratio of the generated image.",
    )
    image_ids: list[str] | None = Field(
        default=None,
        description=(
            f"Optional list of image UUIDs (max {MAX_INPUT_IMAGES}) to use as reference inputs. "
            "Use the 'image_id' values returned from generate_image or upload tools."
        ),
    )

    @model_validator(mode="after")
    def validate_image_inputs(self) -> "GenerateImageInput":
        """Validate image_ids field."""
        if self.image_ids:
            if len(self.image_ids) > MAX_INPUT_IMAGES:
                raise ValueError(f"Maximum {MAX_INPUT_IMAGES} input images allowed, got {len(self.image_ids)}")
            if len(self.image_ids) == 0:
                self.image_ids = None  # Normalize empty list to None
        return self


class ReadImageInput(BaseModel):
    """Input schema for read_image tool."""

    image_id: str = Field(
        description="The UUID of the image to read. Use the 'image_id' value returned from generate_image."
    )
    question: str = Field(
        default="Describe this image in detail, including its content, style, colors, and any notable elements.",
        description="The question or instruction for analyzing the image. Be specific about what information you need.",
    )


# --- Image Generation Implementation ---

# DashScope qwen-image-max uses pixel dimensions, not aspect ratio strings
_ASPECT_RATIO_TO_SIZE: dict[str, str] = {
    "1:1": "1328*1328",
    "16:9": "1664*928",
    "9:16": "928*1664",
    "4:3": "1472*1104",
    "3:4": "1104*1472",
}


async def _generate_image_with_langchain(
    prompt: str,
    aspect_ratio: str = "1:1",
    images: list[tuple[bytes, str]] | None = None,
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
        images: Optional list of (image_bytes, mime_type) tuples to use as references

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    from langchain_core.messages import HumanMessage

    from app.core.providers.manager import get_user_provider_manager
    from app.infra.database import get_task_db_session
    from app.schemas.provider import ProviderType

    image_cfg = get_image_config()

    async with get_task_db_session() as db:
        # Get provider manager which loads system providers from DB
        # The "system" user_id is used since we're accessing system providers
        provider_manager = await get_user_provider_manager("system", db)

        # Create LangChain model using the factory
        # ProviderManager handles all credential setup for Google Vertex
        llm = await provider_manager.create_langchain_model(
            provider_id=ProviderType(image_cfg.Provider),
            model=image_cfg.Model,
        )

    # Request image generation via LangChain
    if images:
        # Build content array with multiple image_url blocks
        content: list[dict[str, Any]] = []
        for image_bytes, image_mime_type in images:
            b64_data = base64.b64encode(image_bytes).decode("utf-8")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image_mime_type};base64,{b64_data}",
                    },
                }
            )

        # Add text prompt with appropriate phrasing for single vs multiple images
        image_count = len(images)
        if image_count == 1:
            reference_text = "Use the provided image as a reference."
        else:
            reference_text = f"Use these {image_count} provided images as references."

        content.append(
            {
                "type": "text",
                "text": f"{reference_text} Generate a new image with aspect ratio {aspect_ratio}: {prompt}",
            }
        )
        message = HumanMessage(content=content)  # type: ignore[arg-type]
    else:
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


async def _generate_image_with_dashscope(
    prompt: str,
    aspect_ratio: str = "1:1",
    images: list[tuple[bytes, str]] | None = None,
) -> tuple[bytes, str]:
    """
    Generate an image using DashScope API.

    Routes between two models:
    - qwen-image-max: text-to-image (no reference images)
    - qwen-image-edit-max: image editing (with reference images)

    Reference images are saved to temp files so the DashScope SDK
    can upload them to its own OSS (avoids SSRF issues with private URLs).

    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Aspect ratio for the generated image
        images: Optional list of (image_bytes, mime_type) tuples for reference

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    import os
    import tempfile

    import httpx
    from dashscope import AioMultiModalConversation

    image_cfg = get_image_config()
    api_key = configs.LLM.qwen.key.get_secret_value()
    if not api_key:
        raise ValueError("QWEN API key is not configured (XYZEN_LLM_QWEN_KEY)")

    has_references = bool(images)
    temp_files: list[str] = []

    try:
        if has_references and images:
            # Use edit model — save reference images to temp files for SDK upload
            model = image_cfg.EditModel
            content: list[dict[str, str]] = []

            for img_bytes, img_mime in images:
                ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
                ext = ext_map.get(img_mime, ".png")
                tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                tmp.write(img_bytes)
                tmp.close()
                temp_files.append(tmp.name)
                content.append({"image": tmp.name})

            content.append({"text": prompt})
            messages = [{"role": "user", "content": content}]

            response = await AioMultiModalConversation.call(
                api_key=api_key,
                model=model,
                messages=messages,
                result_format="message",
                stream=False,
                watermark=False,
                negative_prompt="",
            )
        else:
            # Use generation model — text only
            model = image_cfg.Model
            if aspect_ratio not in _ASPECT_RATIO_TO_SIZE:
                supported = ", ".join(sorted(_ASPECT_RATIO_TO_SIZE.keys()))
                raise ValueError(f"Unsupported aspect ratio: {aspect_ratio}. Supported: {supported}")
            size = _ASPECT_RATIO_TO_SIZE[aspect_ratio]
            messages = [{"role": "user", "content": [{"text": prompt}]}]

            response = await AioMultiModalConversation.call(
                api_key=api_key,
                model=model,
                messages=messages,
                result_format="message",
                stream=False,
                watermark=False,
                prompt_extend=True,
                negative_prompt="",
                size=size,
            )
    finally:
        # Clean up temp files
        for tmp_path in temp_files:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    if response.status_code != 200:
        raw_output = getattr(response, "output", None)
        raise ValueError(
            f"DashScope image generation failed (model={model}): "
            f"code={response.code}, message={response.message}, output={raw_output}"
        )

    # Extract image URL from response
    # Response structure: output.choices[0].message.content -> list of dicts
    # Image results come as: {"image": "https://..."}
    image_url = None
    choices = response.output.get("choices", [])
    if choices:
        msg_content = choices[0].get("message", {}).get("content", [])
        for block in msg_content:
            if isinstance(block, dict) and "image" in block:
                image_url = block["image"]
                break

    if not image_url:
        raise ValueError("No image URL in DashScope response")

    # Download the image from the URL
    async with httpx.AsyncClient(timeout=60) as client:
        img_response = await client.get(image_url)
        img_response.raise_for_status()
        image_bytes = img_response.content
        # Infer mime type from content-type header or URL
        content_type_header = img_response.headers.get("content-type", "image/png")
        mime_type = content_type_header.split(";")[0].strip()

    return image_bytes, mime_type


async def _load_images_for_generation(user_id: str, image_ids: list[str]) -> list[tuple[bytes, str, str]]:
    """
    Load multiple images for generation from the database.

    Args:
        user_id: User ID for permission check
        image_ids: List of image UUIDs to load

    Returns:
        List of tuples: (image_bytes, mime_type, storage_key)

    Raises:
        ValueError: If any image_id is invalid, not found, deleted, or inaccessible
    """
    from app.infra.database import get_task_db_session
    from app.repos.file import FileRepository

    results: list[tuple[bytes, str, str]] = []

    async with get_task_db_session() as db:
        file_repo = FileRepository(db)
        storage = get_storage_service()

        for image_id in image_ids:
            try:
                file_uuid = UUID(image_id)
            except ValueError as exc:
                raise ValueError(f"Invalid image_id format: {image_id}") from exc

            file_record = await file_repo.get_file_by_id(file_uuid)

            if file_record is None:
                raise ValueError(
                    f"Image not found: {image_id}. "
                    "Make sure you are using the 'image_id' value from a previous generate_image result, "
                    "not a user_id or session_id."
                )

            if file_record.is_deleted:
                raise ValueError(f"Image has been deleted: {image_id}")

            if file_record.user_id != user_id and file_record.scope != "public":
                raise ValueError(f"Permission denied: you don't have access to image {image_id}")

            storage_key = file_record.storage_key
            if not storage_key:
                raise ValueError(f"Image has no storage key: {image_id}")
            content_type = file_record.content_type or "image/png"

            # Download from storage
            buffer = io.BytesIO()
            await storage.download_file(storage_key, buffer)
            image_bytes = buffer.getvalue()

            results.append((image_bytes, content_type, storage_key))

    return results


async def _try_mount_in_sandbox(session_id: str, image_bytes: bytes, filename: str) -> str | None:
    """Try to write generated image into the sandbox. Returns sandbox path or None."""
    try:
        from app.infra.sandbox import get_sandbox_manager

        manager = get_sandbox_manager(session_id)
        sandbox_id = await manager.get_sandbox_id()
        if not sandbox_id:
            return None

        sandbox_path = f"/workspace/images/{filename}"
        await manager.write_file_bytes(sandbox_path, image_bytes)
        logger.info(f"Auto-mounted generated image in sandbox: {sandbox_path}")
        return sandbox_path
    except Exception:
        logger.debug("Failed to auto-mount image in sandbox (non-fatal)", exc_info=True)
        return None


async def _generate_image(
    user_id: str,
    prompt: str,
    aspect_ratio: str = "1:1",
    image_ids: list[str] | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Generate an image and store it to OSS, then register in database.

    Args:
        user_id: User ID for storage organization
        prompt: Image description
        aspect_ratio: Aspect ratio for the image
        image_ids: Optional list of image UUIDs to use as reference inputs

    Returns:
        Dictionary with success status, path, URL, and metadata
    """
    try:
        # Load optional reference images
        images_for_generation: list[tuple[bytes, str]] | None = None
        source_storage_keys: list[str] = []
        source_image_ids: list[str] = image_ids or []

        if source_image_ids:
            loaded_images = await _load_images_for_generation(user_id, source_image_ids)
            images_for_generation = [(img[0], img[1]) for img in loaded_images]
            source_storage_keys = [img[2] for img in loaded_images]

        # Generate image — route to DashScope or LangChain based on region
        image_cfg = get_image_config()
        if image_cfg.Provider == "qwen":
            image_bytes, mime_type = await _generate_image_with_dashscope(
                prompt,
                aspect_ratio,
                images=images_for_generation,
            )
        else:
            image_bytes, mime_type = await _generate_image_with_langchain(
                prompt,
                aspect_ratio,
                images=images_for_generation,
            )

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
                file_size=len(image_bytes),
                scope="generated",
                category="images",
                status="confirmed",
                metainfo={
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "source_image_ids": source_image_ids,
                    "source_storage_keys": source_storage_keys,
                },
            )
            file_record = await file_repo.create_file(file_data)
            # Capture ID right after create_file (which already flushes + refreshes).
            # Must read before commit — post-commit refresh can return stale data.
            generated_image_id = str(file_record.id)
            await db.commit()

        logger.info(f"Generated image for user {user_id}: {storage_key} (id={generated_image_id})")

        result: dict[str, Any] = {
            "success": True,
            "image_id": generated_image_id,
            "path": storage_key,
            "url": url,
            "markdown": f"![Generated Image]({url})",
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "source_image_ids": source_image_ids,
            "mime_type": mime_type,
            "size_bytes": len(image_bytes),
        }

        # Auto-mount in sandbox if active
        if session_id:
            sandbox_path = await _try_mount_in_sandbox(session_id, image_bytes, filename)
            if sandbox_path:
                result["sandbox_path"] = sandbox_path

        return result

    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        return {
            "success": False,
            "error": f"Image generation failed: {e!s}",
            "prompt": prompt,
        }


async def _analyze_image_with_vision_model(image_bytes: bytes, content_type: str, question: str) -> str:
    """
    Analyze an image using a vision model.

    Args:
        image_bytes: Raw image bytes
        content_type: MIME type of the image
        question: The question/instruction for analyzing the image

    Returns:
        Text description/analysis from the vision model
    """
    from langchain_core.messages import HumanMessage

    from app.core.providers.manager import get_user_provider_manager
    from app.infra.database import get_task_db_session
    from app.schemas.provider import ProviderType

    image_cfg = get_image_config()

    # Encode image to base64 for the vision model
    b64_data = base64.b64encode(image_bytes).decode("utf-8")

    async with get_task_db_session() as db:
        provider_manager = await get_user_provider_manager("system", db)
        llm = await provider_manager.create_langchain_model(
            provider_id=ProviderType(image_cfg.VisionProvider),
            model=image_cfg.VisionModel,
        )

    # Create multimodal message with image and question
    message = HumanMessage(
        content=[
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{content_type};base64,{b64_data}",
                },
            },
            {
                "type": "text",
                "text": question,
            },
        ]
    )

    response = await llm.ainvoke([message])

    # Extract text from response
    if isinstance(response.content, str):
        return response.content
    elif isinstance(response.content, list):
        # Concatenate text blocks
        text_parts = []
        for block in response.content:
            if isinstance(block, str):
                text_parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        return "\n".join(text_parts)
    return str(response.content)


async def _read_image(user_id: str, image_id: str, question: str) -> dict[str, Any]:
    """
    Read and analyze an image using a vision model.

    Performs a database lookup to retrieve the image, then uses a vision model
    to analyze and describe the image based on the provided question.

    Args:
        user_id: Current user ID for permission check
        image_id: UUID of the file record in the database
        question: The question/instruction for analyzing the image

    Returns:
        Dictionary with success status, analysis result, and metadata
    """
    from app.infra.database import get_task_db_session
    from app.repos.file import FileRepository

    try:
        # Parse and validate UUID
        try:
            file_uuid = UUID(image_id)
        except ValueError:
            return {
                "success": False,
                "error": f"Invalid image_id format: {image_id}",
                "image_id": image_id,
            }

        # Look up file record in database
        async with get_task_db_session() as db:
            file_repo = FileRepository(db)
            file_record = await file_repo.get_file_by_id(file_uuid)

            if file_record is None:
                return {
                    "success": False,
                    "error": f"Image not found: {image_id}",
                    "image_id": image_id,
                }

            # Check if file is deleted
            if file_record.is_deleted:
                return {
                    "success": False,
                    "error": f"Image has been deleted: {image_id}",
                    "image_id": image_id,
                }

            # Permission check: user must own the file or file must be public
            if file_record.user_id != user_id and file_record.scope != "public":
                return {
                    "success": False,
                    "error": "Permission denied: you don't have access to this image",
                    "image_id": image_id,
                }

            # Extract metadata from database record
            storage_key = file_record.storage_key
            if not storage_key:
                raise ValueError(f"Image has no storage key: {image_id}")
            content_type = file_record.content_type or "image/png"
            file_size = file_record.file_size
            original_filename = file_record.original_filename
            metainfo = file_record.metainfo or {}

        # Download image from storage
        storage = get_storage_service()
        buffer = io.BytesIO()
        await storage.download_file(storage_key, buffer)
        image_bytes = buffer.getvalue()

        # Analyze image with vision model
        analysis = await _analyze_image_with_vision_model(image_bytes, content_type, question)

        # Generate a fresh download URL for the image
        url = await storage.generate_download_url(storage_key, expires_in=3600 * 24)  # 24 hours

        logger.info(f"Analyzed image: {image_id} -> {storage_key} ({len(image_bytes)} bytes)")

        return {
            "success": True,
            "image_id": image_id,
            "analysis": analysis,
            "url": url,
            "markdown": f"![{original_filename}]({url})",
            "content_type": content_type,
            "size_bytes": file_size,
            "filename": original_filename,
            "prompt": metainfo.get("prompt"),  # For generated images
            "aspect_ratio": metainfo.get("aspect_ratio"),  # For generated images
        }

    except Exception as e:
        logger.error(f"Error reading image {image_id}: {e}")
        return {
            "success": False,
            "error": f"Failed to read image: {e!s}",
            "image_id": image_id,
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
    async def generate_image_placeholder(
        prompt: str,
        aspect_ratio: str = "1:1",
        image_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        return {"error": "Image tools require agent context binding", "success": False}

    tools["generate_image"] = StructuredTool(
        name="generate_image",
        description=(
            "Generate an image based on a text description. "
            "Provide a detailed prompt describing the desired image. "
            f"To generate based on previous images, pass 'image_ids' with up to {MAX_INPUT_IMAGES} reference image UUIDs. "
            "Returns a JSON result containing 'image_id' (for future reference), 'url', and 'markdown' - use the 'markdown' field directly in your response to display the image. "
            "TIP: You can use 'image_id' values when creating PPTX presentations with knowledge_write - see knowledge_help(topic='image_slides') for details."
        ),
        args_schema=GenerateImageInput,
        coroutine=generate_image_placeholder,
    )

    # Read image tool (placeholder)
    async def read_image_placeholder(image_id: str, question: str = "Describe this image in detail.") -> dict[str, Any]:
        return {"error": "Image tools require agent context binding", "success": False}

    tools["read_image"] = StructuredTool(
        name="read_image",
        description=(
            "Analyze an image using a vision model. "
            "Provide the 'image_id' from generate_image and optionally a specific question about the image. "
            "Returns the vision model's analysis of the image content."
        ),
        args_schema=ReadImageInput,
        coroutine=read_image_placeholder,
    )

    return tools


def create_image_tools_for_agent(user_id: str, session_id: str | None = None) -> list[BaseTool]:
    """
    Create image tools bound to a specific user's context.

    This creates actual working tools with user_id captured in closures.

    Args:
        user_id: The user ID for storage organization
        session_id: Optional session ID for auto-mounting images in sandbox

    Returns:
        List of BaseTool instances with context bound
    """
    tools: list[BaseTool] = []

    # Generate image tool (bound to user)
    async def generate_image_bound(
        prompt: str,
        aspect_ratio: str = "1:1",
        image_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        return await _generate_image(user_id, prompt, aspect_ratio, image_ids, session_id=session_id)

    tools.append(
        StructuredTool(
            name="generate_image",
            description=(
                "Generate an image based on a text description. "
                "Provide a detailed prompt describing the desired image including style, colors, composition, and subject. "
                f"To generate based on previous images, pass 'image_ids' with up to {MAX_INPUT_IMAGES} reference image UUIDs. "
                "Returns a JSON result containing 'image_id' (for future reference), 'url', and 'markdown' - use the 'markdown' field directly in your response to display the image to the user. "
                "TIP: You can use 'image_id' values when creating beautiful PPTX presentations with knowledge_write in image_slides mode - call knowledge_help(topic='image_slides') for the full workflow."
            ),
            args_schema=GenerateImageInput,
            coroutine=generate_image_bound,
        )
    )

    # Read image tool (bound to user for permission check)
    async def read_image_bound(
        image_id: str,
        question: str = "Describe this image in detail, including its content, style, colors, and any notable elements.",
    ) -> dict[str, Any]:
        return await _read_image(user_id, image_id, question)

    tools.append(
        StructuredTool(
            name="read_image",
            description=(
                "Analyze an image using a vision model. "
                "Provide the 'image_id' from generate_image and optionally a specific question about the image. "
                "Returns the vision model's analysis in the 'analysis' field, plus URL and metadata."
            ),
            args_schema=ReadImageInput,
            coroutine=read_image_bound,
        )
    )

    return tools


__all__ = [
    "create_image_tools",
    "create_image_tools_for_agent",
    "GenerateImageInput",
    "ReadImageInput",
    "MAX_INPUT_IMAGES",
]
