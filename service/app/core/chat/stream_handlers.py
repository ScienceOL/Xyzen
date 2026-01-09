"""
Stream event handlers for LangChain agent responses.

Provides modular handlers for processing different types of streaming events
from LangChain agents, including tool calls, model responses, and citations.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass, field
from io import BytesIO
from typing import TYPE_CHECKING, Any, AsyncGenerator

from langchain_core.messages import AIMessage

from app.schemas.chat_event_types import (
    CitationData,
    GeneratedFileInfo,
    GeneratedFilesData,
    SearchCitationsData,
    StreamingChunkData,
    StreamingEndData,
    StreamingEvent,
    StreamingStartData,
    ThinkingChunkData,
    ThinkingEndData,
    ThinkingStartData,
    TokenUsageData,
    ToolCallRequestData,
    ToolCallResponseData,
)
from app.schemas.chat_events import ChatEventType, ProcessingStatus, ToolCallStatus

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.models.file import File

logger = logging.getLogger(__name__)

# Configuration for batch logging to reduce performance impact
STREAMING_LOG_BATCH_SIZE = 50


@dataclass
class StreamContext:
    """Context maintained during streaming."""

    stream_id: str
    db: "AsyncSession"
    user_id: str
    is_streaming: bool = False
    assistant_buffer: list[str] = field(default_factory=list)
    token_count: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    # Thinking/reasoning content state
    is_thinking: bool = False
    thinking_buffer: list[str] = field(default_factory=list)


class ToolEventHandler:
    """Handle tool call request and response events."""

    @staticmethod
    def create_tool_request_event(tool_call: dict[str, Any]) -> StreamingEvent:
        """
        Create a tool call request event.

        Args:
            tool_call: Tool call dict from LangChain agent

        Returns:
            StreamingEvent for tool call request
        """
        data: ToolCallRequestData = {
            "id": tool_call.get("id", ""),
            "name": tool_call.get("name", ""),
            "description": f"Tool: {tool_call.get('name', '')}",
            "arguments": tool_call.get("args", {}),
            "status": ToolCallStatus.EXECUTING,
            "timestamp": asyncio.get_event_loop().time(),
        }
        return {"type": ChatEventType.TOOL_CALL_REQUEST, "data": data}

    @staticmethod
    def create_tool_response_event(
        tool_call_id: str, result: str, status: str = ToolCallStatus.COMPLETED
    ) -> StreamingEvent:
        """
        Create a tool call response event.

        Args:
            tool_call_id: ID of the tool call
            result: Formatted result string
            status: Tool call status

        Returns:
            StreamingEvent for tool call response
        """
        data: ToolCallResponseData = {
            "toolCallId": tool_call_id,
            "status": status,
            "result": result,
        }
        return {"type": ChatEventType.TOOL_CALL_RESPONSE, "data": data}


class StreamingEventHandler:
    """Handle streaming token events."""

    @staticmethod
    def create_streaming_start(stream_id: str) -> StreamingEvent:
        """Create streaming start event."""
        data: StreamingStartData = {"id": stream_id}
        return {"type": ChatEventType.STREAMING_START, "data": data}

    @staticmethod
    def create_streaming_chunk(stream_id: str, content: str) -> StreamingEvent:
        """Create streaming chunk event."""
        data: StreamingChunkData = {"id": stream_id, "content": content}
        return {"type": ChatEventType.STREAMING_CHUNK, "data": data}

    @staticmethod
    def create_streaming_end(stream_id: str) -> StreamingEvent:
        """Create streaming end event."""
        data: StreamingEndData = {
            "id": stream_id,
            "created_at": asyncio.get_event_loop().time(),
        }
        return {"type": ChatEventType.STREAMING_END, "data": data}

    @staticmethod
    def create_token_usage_event(input_tokens: int, output_tokens: int, total_tokens: int) -> StreamingEvent:
        """Create token usage event."""
        data: TokenUsageData = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
        }
        return {"type": ChatEventType.TOKEN_USAGE, "data": data}

    @staticmethod
    def create_processing_event(status: str = ProcessingStatus.PREPARING_REQUEST) -> StreamingEvent:
        """Create processing status event."""
        return {"type": ChatEventType.PROCESSING, "data": {"status": status}}

    @staticmethod
    def create_error_event(error: str) -> StreamingEvent:
        """Create error event."""
        return {"type": ChatEventType.ERROR, "data": {"error": error}}


class ThinkingEventHandler:
    """Handle thinking/reasoning content streaming events."""

    @staticmethod
    def create_thinking_start(stream_id: str) -> StreamingEvent:
        """Create thinking start event."""
        data: ThinkingStartData = {"id": stream_id}
        return {"type": ChatEventType.THINKING_START, "data": data}

    @staticmethod
    def create_thinking_chunk(stream_id: str, content: str) -> StreamingEvent:
        """Create thinking chunk event."""
        data: ThinkingChunkData = {"id": stream_id, "content": content}
        return {"type": ChatEventType.THINKING_CHUNK, "data": data}

    @staticmethod
    def create_thinking_end(stream_id: str) -> StreamingEvent:
        """Create thinking end event."""
        data: ThinkingEndData = {"id": stream_id}
        return {"type": ChatEventType.THINKING_END, "data": data}

    @staticmethod
    def extract_thinking_content(message_chunk: Any) -> str | None:
        """
        Extract thinking/reasoning content from message chunk.

        Checks various provider-specific locations:
        - Anthropic Claude: content blocks with type="thinking"
        - DeepSeek R1: additional_kwargs.reasoning_content
        - Gemini 3: content blocks with type="thought" or response_metadata.reasoning
        - Generic: response_metadata.reasoning_content or thinking

        Args:
            message_chunk: Message chunk from LLM streaming

        Returns:
            Extracted thinking content or None
        """
        # Check for DeepSeek/OpenAI style reasoning_content in additional_kwargs
        if hasattr(message_chunk, "additional_kwargs"):
            additional_kwargs = message_chunk.additional_kwargs
            if isinstance(additional_kwargs, dict):
                reasoning = additional_kwargs.get("reasoning_content")
                if reasoning:
                    logger.debug("Found thinking in additional_kwargs.reasoning_content")
                    return reasoning

        # Check for thinking/thought blocks in content (Anthropic, Gemini 3)
        if hasattr(message_chunk, "content"):
            content = message_chunk.content
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        block_type = block.get("type", "")
                        # Anthropic Claude uses "thinking" type
                        if block_type == "thinking":
                            thinking_text = block.get("thinking", "")
                            if thinking_text:
                                logger.debug("Found thinking in content block type='thinking'")
                                return thinking_text
                        # Gemini 3 uses "thought" type
                        elif block_type == "thought":
                            thought_text = block.get("thought", "") or block.get("text", "")
                            if thought_text:
                                logger.debug("Found thinking in content block type='thought'")
                                return thought_text

        # Check response_metadata for thinking content
        if hasattr(message_chunk, "response_metadata"):
            metadata = message_chunk.response_metadata
            if isinstance(metadata, dict):
                # Gemini 3 uses "reasoning" key
                thinking = (
                    metadata.get("thinking")
                    or metadata.get("reasoning_content")
                    or metadata.get("reasoning")
                    or metadata.get("thoughts")
                )
                if thinking:
                    logger.debug("Found thinking in response_metadata: %s", list(metadata.keys()))
                    return thinking

        return None


class CitationExtractor:
    """Extract citations from LLM response metadata."""

    @staticmethod
    def extract_citations(response_metadata: dict[str, Any]) -> list[CitationData]:
        """
        Extract citations from response metadata.

        Supports both Google Grounding Metadata and OpenAI Annotations.

        Args:
            response_metadata: Response metadata dict from AIMessage

        Returns:
            List of citation data objects
        """
        citations: list[CitationData] = []

        if not isinstance(response_metadata, dict):
            return citations

        # 1. Handle Google Grounding Metadata
        grounding_metadata = response_metadata.get("grounding_metadata", {})
        if grounding_metadata:
            citations.extend(CitationExtractor._extract_google_grounding(grounding_metadata))

        # 2. Handle OpenAI Annotations
        annotations = response_metadata.get("annotations", [])
        if annotations:
            citations.extend(CitationExtractor._extract_openai_annotations(annotations))

        # Deduplicate by URL
        return CitationExtractor._deduplicate_citations(citations)

    @staticmethod
    def _extract_google_grounding(grounding_metadata: dict[str, Any]) -> list[CitationData]:
        """Extract citations from Google Grounding Metadata."""
        citations: list[CitationData] = []

        web_search_queries = grounding_metadata.get("web_search_queries", [])
        grounding_chunks = grounding_metadata.get("grounding_chunks", [])
        grounding_supports = grounding_metadata.get("grounding_supports", [])

        # Build chunk index -> chunk data map
        chunk_map: dict[int, dict[str, str]] = {}
        for idx, chunk in enumerate(grounding_chunks):
            if isinstance(chunk, dict) and "web" in chunk:
                web_info = chunk["web"]
                chunk_map[idx] = {
                    "url": web_info.get("uri", ""),
                    "title": web_info.get("title", ""),
                }

        # Create citations from grounding_supports
        for support in grounding_supports:
            if not isinstance(support, dict):
                continue

            segment = support.get("segment", {})
            chunk_indices = support.get("grounding_chunk_indices", [])
            cited_text = segment.get("text", "")
            start_index = segment.get("start_index")
            end_index = segment.get("end_index")

            for chunk_idx in chunk_indices:
                if chunk_idx in chunk_map:
                    citation: CitationData = {
                        "url": chunk_map[chunk_idx]["url"],
                        "title": chunk_map[chunk_idx]["title"],
                        "cited_text": cited_text,
                        "start_index": start_index,
                        "end_index": end_index,
                    }
                    if web_search_queries:
                        citation["search_queries"] = web_search_queries
                    citations.append(citation)

        return citations

    @staticmethod
    def _extract_openai_annotations(annotations: list[Any]) -> list[CitationData]:
        """Extract citations from OpenAI annotations."""
        citations: list[CitationData] = []

        for annotation in annotations:
            if isinstance(annotation, dict) and annotation.get("type") == "citation":
                citation: CitationData = {
                    "url": annotation.get("url", ""),
                    "title": annotation.get("title"),
                    "cited_text": annotation.get("text"),
                    "start_index": annotation.get("start_index"),
                    "end_index": annotation.get("end_index"),
                }
                citations.append(citation)

        return citations

    @staticmethod
    def _deduplicate_citations(citations: list[CitationData]) -> list[CitationData]:
        """Remove duplicate citations by URL."""
        seen_urls: set[str] = set()
        unique_citations: list[CitationData] = []

        for citation in citations:
            url = citation.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_citations.append(citation)

        return unique_citations

    @staticmethod
    def create_citations_event(citations: list[CitationData]) -> StreamingEvent:
        """Create search citations event."""
        data: SearchCitationsData = {"citations": citations}
        return {"type": ChatEventType.SEARCH_CITATIONS, "data": data}


class GeneratedFileHandler:
    """Handle generated files (e.g., images) from model responses."""

    @staticmethod
    async def save_generated_image(image_data: str, user_id: str, db: "AsyncSession") -> "File":
        """
        Save a base64-encoded image to storage and create DB record.

        Args:
            image_data: Base64 data URL (e.g., data:image/png;base64,...)
            user_id: User ID for file ownership
            db: Database session

        Returns:
            Created File object

        Raises:
            ValueError: If image_data format is invalid
        """
        from app.core.storage import FileCategory, FileScope, generate_storage_key, get_storage_service
        from app.models.file import FileCreate
        from app.repos.file import FileRepository

        if not image_data.startswith("data:image/") or ";base64," not in image_data:
            raise ValueError("Invalid image data URL format")

        # Extract base64 data
        header, base64_data = image_data.split(";base64,")

        # Determine extension
        file_ext = "png"  # default
        if "jpeg" in header or "jpg" in header:
            file_ext = "jpg"
        elif "webp" in header:
            file_ext = "webp"

        image_bytes = base64.b64decode(base64_data)

        # Create storage key and upload
        storage_service = get_storage_service()
        filename = f"generated_image_{int(asyncio.get_event_loop().time())}.{file_ext}"
        storage_key = generate_storage_key(
            user_id,
            filename,
            scope=FileScope.GENERATED,
            category=FileCategory.IMAGE,
        )

        await storage_service.upload_file(
            BytesIO(image_bytes),
            storage_key,
            content_type=f"image/{file_ext}",
        )

        # Create DB record
        file_repo = FileRepository(db)
        file_create = FileCreate(
            user_id=user_id,
            storage_key=storage_key,
            original_filename=filename,
            content_type=f"image/{file_ext}",
            file_size=len(image_bytes),
            scope=FileScope.GENERATED,
            category=FileCategory.IMAGE,
            status="pending",
        )

        return await file_repo.create_file(file_create)

    @staticmethod
    async def process_generated_content(
        content: list[Any], user_id: str, db: "AsyncSession"
    ) -> tuple[list["File"], list[GeneratedFileInfo]]:
        """
        Process multimodal content and save any generated images.

        Args:
            content: List of content blocks from model response
            user_id: User ID for file ownership
            db: Database session

        Returns:
            Tuple of (list of File objects, list of file info dicts for frontend)
        """
        generated_files: list[File] = []
        files_data: list[GeneratedFileInfo] = []

        for block in content:
            if not isinstance(block, dict) or not block.get("image_url"):
                continue

            try:
                image_url_dict = block.get("image_url", {})
                image_url = image_url_dict.get("url") if isinstance(image_url_dict, dict) else image_url_dict

                if (
                    image_url
                    and isinstance(image_url, str)
                    and image_url.startswith("data:image/")
                    and ";base64," in image_url
                ):
                    file_obj = await GeneratedFileHandler.save_generated_image(image_url, user_id, db)
                    generated_files.append(file_obj)

                    file_info: GeneratedFileInfo = {
                        "id": str(file_obj.id),
                        "name": file_obj.original_filename,
                        "type": file_obj.content_type,
                        "size": file_obj.file_size,
                        "category": file_obj.category,
                        "download_url": f"/xyzen/api/v1/files/{file_obj.id}/download",
                    }
                    files_data.append(file_info)

                    logger.info(f"Generated image saved: {file_obj.id}")

            except Exception as e:
                logger.error(f"Failed to process generated image: {e}")

        # Ensure generated file records are visible to subsequent HTTP requests
        # (e.g., browser immediately fetching /files/{id}/download) before we emit events.
        if generated_files:
            await db.commit()

        return generated_files, files_data

    @staticmethod
    def create_generated_files_event(files: list[GeneratedFileInfo]) -> StreamingEvent:
        """Create generated files event."""
        data: GeneratedFilesData = {"files": files}
        return {"type": ChatEventType.GENERATED_FILES, "data": data}


class TokenStreamProcessor:
    """Process token-by-token streaming from LLM."""

    @staticmethod
    def extract_token_text(message_chunk: Any) -> str | None:
        """
        Extract text from a message chunk.

        Args:
            message_chunk: Chunk from LLM streaming

        Returns:
            Extracted text or None
        """
        if isinstance(message_chunk, str):
            return message_chunk
        if hasattr(message_chunk, "content"):
            return getattr(message_chunk, "content") or None
        if hasattr(message_chunk, "text"):
            return getattr(message_chunk, "text") or None

        # Fallback best-effort
        try:
            return str(message_chunk)
        except Exception:
            return None

    @staticmethod
    def extract_usage_metadata(message_chunk: Any) -> tuple[int, int, int] | None:
        """
        Extract token usage from message chunk.

        Args:
            message_chunk: Chunk from LLM streaming

        Returns:
            Tuple of (input_tokens, output_tokens, total_tokens) or None
        """
        if not hasattr(message_chunk, "usage_metadata"):
            return None

        usage_metadata = message_chunk.usage_metadata
        if not isinstance(usage_metadata, dict):
            return None

        return (
            usage_metadata.get("input_tokens", 0),
            usage_metadata.get("output_tokens", 0),
            usage_metadata.get("total_tokens", 0),
        )

    @staticmethod
    def should_log_batch(token_count: int) -> bool:
        """Check if we should log based on batch size."""
        return token_count == 1 or token_count % STREAMING_LOG_BATCH_SIZE == 0


class UpdatesStreamProcessor:
    """Process 'updates' mode events from LangChain agent."""

    @staticmethod
    async def process_model_response(
        message: AIMessage,
        ctx: StreamContext,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Process a model response message for generated content and citations.

        Args:
            message: AIMessage from model
            ctx: Stream context

        Yields:
            StreamingEvents for generated files and citations
        """
        content = message.content

        # Handle multimodal content (e.g., generated images)
        if isinstance(content, list):
            generated_files, files_data = await GeneratedFileHandler.process_generated_content(
                content, ctx.user_id, ctx.db
            )
            if files_data:
                yield GeneratedFileHandler.create_generated_files_event(files_data)

        # Extract and emit citations
        if hasattr(message, "response_metadata"):
            citations = CitationExtractor.extract_citations(message.response_metadata)
            if citations:
                logger.info(f"Emitting {len(citations)} unique search citations")
                yield CitationExtractor.create_citations_event(citations)
