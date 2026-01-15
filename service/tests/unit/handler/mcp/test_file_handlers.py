"""
Tests for file handlers.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.mcp.document_spec import (
    DocumentSpec,
    HeadingBlock,
    ListBlock,
    PresentationSpec,
    SheetSpec,
    SlideSpec,
    SpreadsheetSpec,
    TableBlock,
    TextBlock,
)
from app.mcp.file_handlers import (
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
