"""
Tests for file handlers.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.tools.utils.documents.handlers import (
    DocxFileHandler,
    ExcelFileHandler,
    FileHandlerFactory,
    HtmlFileHandler,
    ImageFileHandler,
    JsonFileHandler,
    PdfFileHandler,
    PptxFileHandler,
    TextFileHandler,
    XmlFileHandler,
    YamlFileHandler,
)
from app.tools.utils.documents.image_fetcher import FetchedImage
from app.tools.utils.documents.spec import (
    DocumentSpec,
    HeadingBlock,
    ImageBlock,
    ImageSlideSpec,
    ListBlock,
    PresentationSpec,
    SheetSpec,
    SlideSpec,
    SpreadsheetSpec,
    TableBlock,
    TextBlock,
)


class TestFileHandlerFactory:
    def test_get_handler(self) -> None:
        # Existing handlers
        assert isinstance(FileHandlerFactory.get_handler("test.pdf"), PdfFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.docx"), DocxFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.doc"), DocxFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.xlsx"), ExcelFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.xls"), ExcelFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.pptx"), PptxFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.ppt"), PptxFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.txt"), TextFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.csv"), TextFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.py"), TextFileHandler)

    def test_get_handler_new_types(self) -> None:
        # New handlers
        assert isinstance(FileHandlerFactory.get_handler("test.html"), HtmlFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.htm"), HtmlFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.json"), JsonFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.yaml"), YamlFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.yml"), YamlFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.xml"), XmlFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.png"), ImageFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.jpg"), ImageFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.jpeg"), ImageFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.gif"), ImageFileHandler)
        assert isinstance(FileHandlerFactory.get_handler("test.webp"), ImageFileHandler)


class TestTextFileHandler:
    def test_read_write(self) -> None:
        handler = TextFileHandler()
        content = "Hello, World!"

        # Write
        bytes_content = handler.create_content(content)
        assert isinstance(bytes_content, bytes)
        assert bytes_content == b"Hello, World!"

        # Read
        read_content = handler.read_content(bytes_content)
        assert read_content == content

    def test_read_image_fail(self) -> None:
        handler = TextFileHandler()
        with pytest.raises(ValueError):
            handler.read_content(b"test", mode="image")


class TestHtmlFileHandler:
    def test_read_html(self) -> None:
        handler = HtmlFileHandler()
        html = b"<html><body><h1>Title</h1><p>Content</p></body></html>"
        content = handler.read_content(html)
        assert isinstance(content, str)
        # Should extract text from HTML
        assert "Title" in content or "Content" in content

    def test_read_html_strips_scripts(self) -> None:
        handler = HtmlFileHandler()
        html = b"<html><script>alert('xss')</script><body>Safe content</body></html>"
        content = handler.read_content(html)
        assert "alert" not in content
        assert "Safe content" in content

    def test_create_html(self) -> None:
        handler = HtmlFileHandler()
        content = handler.create_content("Hello\n\nWorld")
        assert b"<!DOCTYPE html>" in content
        assert b"<body>" in content
        assert b"Hello" in content

    def test_read_image_fail(self) -> None:
        handler = HtmlFileHandler()
        with pytest.raises(ValueError):
            handler.read_content(b"<html></html>", mode="image")


class TestJsonFileHandler:
    def test_read_json(self) -> None:
        handler = JsonFileHandler()
        data = {"key": "value", "nested": {"a": 1}}
        json_bytes = json.dumps(data).encode()

        content = handler.read_content(json_bytes)
        assert "key" in content
        assert "value" in content

    def test_read_invalid_json(self) -> None:
        handler = JsonFileHandler()
        content = handler.read_content(b"not valid json")
        assert content == "not valid json"

    def test_create_json_valid(self) -> None:
        handler = JsonFileHandler()
        data = '{"key": "value"}'
        result = handler.create_content(data)
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_create_json_invalid_wraps(self) -> None:
        handler = JsonFileHandler()
        result = handler.create_content("plain text")
        parsed = json.loads(result)
        assert "content" in parsed
        assert parsed["content"] == "plain text"


class TestYamlFileHandler:
    def test_read_yaml(self) -> None:
        handler = YamlFileHandler()
        yaml_content = b"key: value\nnested:\n  a: 1"
        content = handler.read_content(yaml_content)
        assert "key" in content
        assert "value" in content

    def test_create_yaml_from_json(self) -> None:
        handler = YamlFileHandler()
        json_input = '{"key": "value"}'
        result = handler.create_content(json_input)
        assert b"key: value" in result


class TestXmlFileHandler:
    def test_read_xml(self) -> None:
        handler = XmlFileHandler()
        xml = b"<root><item>Hello</item></root>"
        content = handler.read_content(xml)
        assert "Hello" in content
        assert "item" in content

    def test_create_xml(self) -> None:
        handler = XmlFileHandler()
        result = handler.create_content("Test content")
        assert b"<?xml" in result
        assert b"<document>" in result
        assert b"Test content" in result

    def test_read_image_fail(self) -> None:
        handler = XmlFileHandler()
        with pytest.raises(ValueError):
            handler.read_content(b"<xml></xml>", mode="image")


class TestImageFileHandler:
    def test_detect_format_png(self) -> None:
        handler = ImageFileHandler()
        png_magic = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        assert handler._detect_format(png_magic) == "png"

    def test_detect_format_jpeg(self) -> None:
        handler = ImageFileHandler()
        jpeg_magic = b"\xff\xd8" + b"\x00" * 100
        assert handler._detect_format(jpeg_magic) == "jpeg"

    def test_detect_format_gif(self) -> None:
        handler = ImageFileHandler()
        gif_magic = b"GIF89a" + b"\x00" * 100
        assert handler._detect_format(gif_magic) == "gif"

    def test_create_raises_error(self) -> None:
        handler = ImageFileHandler()
        with pytest.raises(ValueError, match="Cannot create image"):
            handler.create_content("text")


# Only mock external deps for complex handlers if they are not installed in test env
# But for now we assume we might need to mock them to run this in strict CI envs
# where deps might be missing during dev.


@patch("fitz.open")
@patch("fitz.Matrix")
class TestPdfFileHandler:
    def test_read_text(self, mock_matrix: MagicMock, mock_open: MagicMock) -> None:
        handler = PdfFileHandler()
        mock_doc = MagicMock()
        mock_page = MagicMock()
        mock_page.get_text.return_value = "Page text"
        mock_page.find_tables.return_value = MagicMock(tables=[])
        mock_doc.__iter__.return_value = [mock_page]
        mock_open.return_value = mock_doc

        content = handler.read_content(b"pdf_bytes", mode="text")
        assert content == "Page text"
        mock_open.assert_called_with(stream=b"pdf_bytes", filetype="pdf")

    def test_write_plain_text(self, mock_matrix: MagicMock, mock_open: MagicMock) -> None:
        handler = PdfFileHandler()
        # For plain text, it uses reportlab, not fitz
        result = handler.create_content("Some text")
        assert isinstance(result, bytes)
        # PDF magic bytes
        assert result[:4] == b"%PDF"


@patch("docx.Document")
class TestDocxFileHandler:
    def test_read(self, mock_document_cls: MagicMock) -> None:
        handler = DocxFileHandler()
        mock_doc = MagicMock()
        mock_element = MagicMock()
        mock_element.tag = "p"
        mock_element.iter.return_value = [MagicMock(text="Para 1")]
        mock_doc.element.body = [mock_element]
        mock_document_cls.return_value = mock_doc

        content = handler.read_content(b"docx_bytes")
        assert "Para 1" in content

    def test_write_plain_text(self, mock_document_cls: MagicMock) -> None:
        handler = DocxFileHandler()
        mock_doc = MagicMock()
        mock_document_cls.return_value = mock_doc

        handler.create_content("Line 1\nLine 2")

        assert mock_doc.add_paragraph.call_count == 2
        mock_doc.save.assert_called()


@patch("openpyxl.Workbook")
@patch("openpyxl.load_workbook")
class TestExcelFileHandler:
    def test_read(self, mock_load_workbook: MagicMock, mock_workbook: MagicMock) -> None:
        handler = ExcelFileHandler()
        mock_wb = MagicMock()
        mock_ws = MagicMock()
        mock_wb.sheetnames = ["Sheet1"]
        mock_wb.__getitem__.return_value = mock_ws
        mock_ws.iter_rows.return_value = [("A", "B")]
        mock_load_workbook.return_value = mock_wb

        content = handler.read_content(b"xlsx_bytes")
        assert "Sheet1" in content
        assert "A\tB" in content

    def test_write_csv(self, mock_load_workbook: MagicMock, mock_workbook: MagicMock) -> None:
        handler = ExcelFileHandler()
        mock_wb = MagicMock()
        mock_ws = MagicMock()
        mock_wb.active = mock_ws
        mock_workbook.return_value = mock_wb

        handler.create_content("A,B\nC,D")

        assert mock_ws.append.call_count == 2
        mock_wb.save.assert_called()


@patch("pptx.Presentation")
class TestPptxFileHandler:
    def test_read(self, mock_presentation: MagicMock) -> None:
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_shape = MagicMock()
        mock_shape.text = "Slide Text"
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = False
        mock_prs.slides = [mock_slide]
        mock_presentation.return_value = mock_prs

        content = handler.read_content(b"pptx_bytes")
        assert "Slide Text" in content

    def test_write_plain_text(self, mock_presentation: MagicMock) -> None:
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        handler.create_content("Title\nBody")

        mock_prs.slides.add_slide.assert_called()
        mock_prs.save.assert_called()


# Document Spec Tests


class TestDocumentSpec:
    def test_create_document_spec(self) -> None:
        spec = DocumentSpec(
            title="Test Doc",
            author="Test Author",
            content=[
                HeadingBlock(content="Chapter 1", level=1),
                TextBlock(content="Some text here"),
                ListBlock(items=["Item 1", "Item 2"], ordered=False),
                TableBlock(headers=["A", "B"], rows=[["1", "2"]]),
            ],
        )
        assert spec.title == "Test Doc"
        assert len(spec.content) == 4
        assert spec.content[0].type == "heading"

    def test_document_spec_json_roundtrip(self) -> None:
        spec = DocumentSpec(
            title="Test",
            content=[TextBlock(content="Hello")],
        )
        json_str = spec.model_dump_json()
        parsed = DocumentSpec.model_validate_json(json_str)
        assert parsed.title == spec.title


class TestSpreadsheetSpec:
    def test_create_spreadsheet_spec(self) -> None:
        spec = SpreadsheetSpec(
            sheets=[
                SheetSpec(
                    name="Data",
                    headers=["Name", "Value"],
                    data=[["A", 1], ["B", 2]],
                )
            ]
        )
        assert len(spec.sheets) == 1
        assert spec.sheets[0].name == "Data"


class TestPresentationSpec:
    def test_create_presentation_spec(self) -> None:
        spec = PresentationSpec(
            title="My Presentation",
            slides=[
                SlideSpec(layout="title", title="Welcome", subtitle="Intro"),
                SlideSpec(
                    layout="title_content",
                    title="Slide 2",
                    content=[ListBlock(items=["Point 1", "Point 2"])],
                ),
            ],
        )
        assert len(spec.slides) == 2
        assert spec.slides[0].layout == "title"


class TestPptxFileHandlerEnhanced:
    """Tests for enhanced PPTX generation with images, tables, and headings."""

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_table_block(self, mock_presentation: MagicMock, mock_image_fetcher: MagicMock) -> None:
        """Test table rendering in PPTX."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_table_shape = MagicMock()
        mock_table = MagicMock()
        mock_table_shape.table = mock_table

        # Mock table cells
        mock_cells = {}
        for row in range(3):  # 1 header + 2 data rows
            for col in range(2):
                cell = MagicMock()
                cell.text_frame.paragraphs = [MagicMock()]
                mock_cells[(row, col)] = cell
        mock_table.cell = lambda r, c: mock_cells[(r, c)]  # type: ignore[misc]

        mock_slide.shapes.add_table.return_value = mock_table_shape
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_prs.slides.__iter__ = lambda self: iter([mock_slide])  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Data Slide",
                    content=[
                        TableBlock(
                            headers=["Name", "Value"],
                            rows=[["Item A", "100"], ["Item B", "200"]],
                        )
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify table was created
        mock_slide.shapes.add_table.assert_called_once()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_heading_block(self, mock_presentation: MagicMock, mock_image_fetcher: MagicMock) -> None:
        """Test heading rendering in PPTX."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_textbox = MagicMock()
        mock_textbox.text_frame.paragraphs = [MagicMock()]

        mock_slide.shapes.add_textbox.return_value = mock_textbox
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Content Slide",
                    content=[
                        HeadingBlock(content="Section Header", level=2),
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify textbox was created for heading
        mock_slide.shapes.add_textbox.assert_called()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_image_block_success(self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock) -> None:
        """Test successful image rendering in PPTX."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()

        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=True,
            data=b"fake_image_data",
            format="png",
            width=200,
            height=150,
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Image Slide",
                    content=[
                        ImageBlock(
                            url="https://example.com/image.png",
                            caption="Test Image",
                        )
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify image was fetched with keyword arguments (new signature)
        mock_fetcher.fetch.assert_called_once_with(url="https://example.com/image.png", image_id=None)
        # Verify add_picture was called
        mock_slide.shapes.add_picture.assert_called()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_image_block_failure_placeholder(
        self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock
    ) -> None:
        """Test image failure shows placeholder text."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_textbox = MagicMock()
        mock_textbox.text_frame.paragraphs = [MagicMock()]

        mock_slide.shapes.add_textbox.return_value = mock_textbox
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher failure
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=False,
            error="Connection timeout",
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Image Slide",
                    content=[ImageBlock(url="https://example.com/fail.png")],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify placeholder textbox was created (not add_picture)
        mock_slide.shapes.add_textbox.assert_called()
        mock_slide.shapes.add_picture.assert_not_called()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_mixed_content(self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock) -> None:
        """Test slide with multiple content block types."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_textbox = MagicMock()
        mock_textbox.text_frame.paragraphs = [MagicMock()]
        mock_table_shape = MagicMock()
        mock_table = MagicMock()
        mock_table_shape.table = mock_table

        # Mock table cells
        mock_cells = {}
        for row in range(2):
            for col in range(2):
                cell = MagicMock()
                cell.text_frame.paragraphs = [MagicMock()]
                mock_cells[(row, col)] = cell
        mock_table.cell = lambda r, c: mock_cells[(r, c)]  # type: ignore[misc]

        mock_slide.shapes.add_textbox.return_value = mock_textbox
        mock_slide.shapes.add_table.return_value = mock_table_shape
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=True,
            data=b"fake_image",
            format="png",
            width=100,
            height=100,
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Mixed Content",
                    content=[
                        HeadingBlock(content="Introduction", level=2),
                        TextBlock(content="Some intro text here."),
                        ListBlock(items=["Point 1", "Point 2"], ordered=True),
                        TableBlock(headers=["A", "B"], rows=[["1", "2"]]),
                        ImageBlock(url="https://example.com/chart.png"),
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify all content types were rendered
        # Multiple textbox calls for heading, text, list
        assert mock_slide.shapes.add_textbox.call_count >= 3
        # One table call
        mock_slide.shapes.add_table.assert_called_once()
        # One picture call
        mock_slide.shapes.add_picture.assert_called_once()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_text_block_with_style(self, mock_presentation: MagicMock, mock_image_fetcher: MagicMock) -> None:
        """Test text block with style attribute."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_textbox = MagicMock()
        mock_paragraph = MagicMock()
        mock_textbox.text_frame.paragraphs = [mock_paragraph]
        mock_textbox.text_frame.word_wrap = True

        mock_slide.shapes.add_textbox.return_value = mock_textbox
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Styled Text",
                    content=[
                        TextBlock(content="Bold text", style="bold"),
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        mock_slide.shapes.add_textbox.assert_called()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_image_with_specified_width(self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock) -> None:
        """Test image block with width parameter."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()

        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=True,
            data=b"fake_image_data",
            format="png",
            width=800,
            height=600,
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Image with Width",
                    content=[
                        ImageBlock(
                            url="https://example.com/image.png",
                            width=288,  # 4 inches at 72 DPI
                        )
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        mock_slide.shapes.add_picture.assert_called()


class TestPresentationSpecImageSlides:
    """Tests for PresentationSpec with image_slides mode."""

    def test_create_presentation_spec_image_slides_mode(self) -> None:
        """Test creating PresentationSpec with image_slides mode."""
        spec = PresentationSpec(
            mode="image_slides",
            title="AI Generated Presentation",
            author="AI Agent",
            image_slides=[
                ImageSlideSpec(image_id="abc-123-456-def", notes="Welcome slide"),
                ImageSlideSpec(image_id="ghi-789-012-jkl", notes="Content slide"),
                ImageSlideSpec(image_id="mno-345-678-pqr"),  # No notes
            ],
        )
        assert spec.mode == "image_slides"
        assert len(spec.image_slides) == 3
        assert spec.image_slides[0].image_id == "abc-123-456-def"
        assert spec.image_slides[0].notes == "Welcome slide"
        assert spec.image_slides[2].notes is None

    def test_create_presentation_spec_structured_mode_default(self) -> None:
        """Test that structured mode is the default."""
        spec = PresentationSpec(
            title="Traditional Presentation",
            slides=[
                SlideSpec(layout="title", title="Welcome"),
            ],
        )
        assert spec.mode == "structured"
        assert len(spec.slides) == 1

    def test_image_slide_spec_json_roundtrip(self) -> None:
        """Test ImageSlideSpec JSON serialization."""
        spec = PresentationSpec(
            mode="image_slides",
            image_slides=[
                ImageSlideSpec(image_id="test-uuid", notes="Test notes"),
            ],
        )
        json_str = spec.model_dump_json()
        parsed = PresentationSpec.model_validate_json(json_str)
        assert parsed.mode == "image_slides"
        assert parsed.image_slides[0].image_id == "test-uuid"


class TestImageBlockWithImageId:
    """Tests for ImageBlock with image_id field."""

    def test_image_block_with_url(self) -> None:
        """Test ImageBlock with URL (traditional)."""
        block = ImageBlock(url="https://example.com/image.png", caption="Test")
        assert block.url == "https://example.com/image.png"
        assert block.image_id is None
        assert block.caption == "Test"

    def test_image_block_with_image_id(self) -> None:
        """Test ImageBlock with image_id (new feature)."""
        block = ImageBlock(image_id="abc-123-uuid", caption="Generated image")
        assert block.url is None
        assert block.image_id == "abc-123-uuid"
        assert block.caption == "Generated image"

    def test_image_block_both_url_and_image_id(self) -> None:
        """Test ImageBlock can have both (though one is preferred)."""
        block = ImageBlock(
            url="https://example.com/fallback.png",
            image_id="abc-123-uuid",
        )
        assert block.url is not None
        assert block.image_id is not None


class TestPptxImageSlidesMode:
    """Tests for PPTX generation with image_slides mode."""

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_create_pptx_image_slides_success(
        self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock
    ) -> None:
        """Test PPTX generation with image_slides mode."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()

        # Mock slide dimensions
        mock_prs.slide_width = MagicMock()
        mock_prs.slide_height = MagicMock()

        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher returning success
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=True,
            data=b"fake_image_data",
            format="png",
            width=1920,
            height=1080,
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            mode="image_slides",
            title="Generated Presentation",
            image_slides=[
                ImageSlideSpec(image_id="slide-1-uuid", notes="Speaker notes 1"),
                ImageSlideSpec(image_id="slide-2-uuid", notes="Speaker notes 2"),
            ],
        )

        handler.create_content(spec.model_dump_json())

        # Verify image fetcher was called with image_id
        assert mock_fetcher.fetch.call_count == 2
        mock_fetcher.fetch.assert_any_call(image_id="slide-1-uuid")
        mock_fetcher.fetch.assert_any_call(image_id="slide-2-uuid")

        # Verify slides were added with full-bleed images
        assert mock_prs.slides.add_slide.call_count == 2
        assert mock_slide.shapes.add_picture.call_count == 2

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_create_pptx_image_slides_failure_shows_placeholder(
        self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock
    ) -> None:
        """Test PPTX generation shows placeholder when image fails."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_textbox = MagicMock()
        mock_textbox.text_frame.paragraphs = [MagicMock()]

        mock_prs.slide_width = MagicMock()
        mock_prs.slide_height = MagicMock()
        mock_slide.shapes.add_textbox.return_value = mock_textbox

        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher returning failure
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=False,
            error="Image not found",
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            mode="image_slides",
            image_slides=[
                ImageSlideSpec(image_id="missing-uuid"),
            ],
        )

        handler.create_content(spec.model_dump_json())

        # Verify placeholder textbox was added instead of picture
        mock_slide.shapes.add_textbox.assert_called()
        mock_slide.shapes.add_picture.assert_not_called()

    @patch("app.tools.utils.documents.image_fetcher.ImageFetcher")
    @patch("pptx.Presentation")
    def test_render_image_block_with_image_id(
        self, mock_presentation: MagicMock, mock_image_fetcher_cls: MagicMock
    ) -> None:
        """Test rendering ImageBlock with image_id in structured slides."""
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()

        mock_prs.slides.add_slide.return_value = mock_slide
        mock_prs.slides.__bool__ = lambda self: True  # type: ignore[method-assign]
        mock_presentation.return_value = mock_prs

        # Mock image fetcher
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = FetchedImage(
            success=True,
            data=b"fake_image_data",
            format="png",
            width=400,
            height=300,
        )
        mock_image_fetcher_cls.return_value = mock_fetcher

        spec = PresentationSpec(
            slides=[
                SlideSpec(
                    layout="title_content",
                    title="Image from generate_image",
                    content=[
                        ImageBlock(
                            image_id="generated-image-uuid",
                            caption="AI Generated Chart",
                        )
                    ],
                )
            ]
        )

        handler.create_content(spec.model_dump_json())

        # Verify image fetcher was called with image_id (not url)
        mock_fetcher.fetch.assert_called_once()
        call_kwargs = mock_fetcher.fetch.call_args
        # The call should have image_id set
        assert call_kwargs[1].get("image_id") == "generated-image-uuid" or (
            call_kwargs[0] == () and call_kwargs[1].get("url") is None
        )
