"""
Multimodal content processing for chat messages.

This package handles conversion of various file types (images, PDFs, audio, etc.)
into formats suitable for LLM consumption (base64, etc.).
"""

from .file_processor import FileProcessor, process_message_files

__all__ = ["FileProcessor", "process_message_files"]
