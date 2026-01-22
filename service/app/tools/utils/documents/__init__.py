"""
Document generation utilities for PDF, DOCX, XLSX, and PPTX files.

This module provides:
- Document specification schemas (spec.py)
- Image fetching from various sources (image_fetcher.py)
- File handlers for reading and creating documents (handlers.py)
"""

from app.tools.utils.documents.handlers import (
    BaseFileHandler,
    DocxFileHandler,
    ExcelFileHandler,
    FileHandlerFactory,
    HtmlFileHandler,
    ImageFileHandler,
    JsonFileHandler,
    PdfFileHandler,
    PptxFileHandler,
    ReadMode,
    TextFileHandler,
    XmlFileHandler,
    YamlFileHandler,
)
from app.tools.utils.documents.image_fetcher import (
    DEFAULT_TIMEOUT,
    MAX_IMAGE_DIMENSION,
    MAX_IMAGE_SIZE_BYTES,
    FetchedImage,
    ImageFetcher,
)
from app.tools.utils.documents.spec import (
    ContentBlock,
    DocumentSpec,
    HeadingBlock,
    ImageBlock,
    ImageSlideSpec,
    ListBlock,
    PageBreakBlock,
    PresentationSpec,
    SheetSpec,
    SlideSpec,
    SpreadsheetSpec,
    TableBlock,
    TextBlock,
)

__all__ = [
    # Spec classes
    "TextBlock",
    "HeadingBlock",
    "ListBlock",
    "TableBlock",
    "ImageBlock",
    "PageBreakBlock",
    "ContentBlock",
    "DocumentSpec",
    "SheetSpec",
    "SpreadsheetSpec",
    "SlideSpec",
    "ImageSlideSpec",
    "PresentationSpec",
    # Image fetcher
    "ImageFetcher",
    "FetchedImage",
    "MAX_IMAGE_SIZE_BYTES",
    "MAX_IMAGE_DIMENSION",
    "DEFAULT_TIMEOUT",
    # File handlers
    "BaseFileHandler",
    "TextFileHandler",
    "HtmlFileHandler",
    "JsonFileHandler",
    "YamlFileHandler",
    "XmlFileHandler",
    "ImageFileHandler",
    "PdfFileHandler",
    "DocxFileHandler",
    "ExcelFileHandler",
    "PptxFileHandler",
    "FileHandlerFactory",
    "ReadMode",
]
