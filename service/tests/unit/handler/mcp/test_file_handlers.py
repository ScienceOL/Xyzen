"""
Tests for file handlers.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.mcp.file_handlers import (
    DocxFileHandler,
    ExcelFileHandler,
    FileHandlerFactory,
    PdfFileHandler,
    PptxFileHandler,
    TextFileHandler,
)


class TestFileHandlerFactory:
    def test_get_handler(self) -> None:
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
        mock_doc.__iter__.return_value = [mock_page]
        mock_open.return_value = mock_doc

        content = handler.read_content(b"pdf_bytes", mode="text")
        assert content == "Page text"
        mock_open.assert_called_with(stream=b"pdf_bytes", filetype="pdf")

    def test_write(self, mock_matrix: MagicMock, mock_open: MagicMock) -> None:
        handler = PdfFileHandler()
        mock_doc = MagicMock()
        mock_open.return_value = mock_doc

        handler.create_content("Some text")

        mock_doc.new_page.assert_called()
        mock_doc.save.assert_called()


@patch("docx.Document")
class TestDocxFileHandler:
    def test_read(self, mock_document_cls: MagicMock) -> None:
        handler = DocxFileHandler()
        mock_doc = MagicMock()
        mock_para = MagicMock()
        mock_para.text = "Para 1"
        mock_doc.paragraphs = [mock_para]
        mock_document_cls.return_value = mock_doc

        content = handler.read_content(b"docx_bytes")
        assert content == "Para 1"

    def test_write(self, mock_document_cls: MagicMock) -> None:
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

    def test_write(self, mock_load_workbook: MagicMock, mock_workbook: MagicMock) -> None:
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
        mock_prs.slides = [mock_slide]
        mock_presentation.return_value = mock_prs

        content = handler.read_content(b"pptx_bytes")
        assert "Slide Text" in content

    def test_write(self, mock_presentation: MagicMock) -> None:
        handler = PptxFileHandler()
        mock_prs = MagicMock()
        mock_slide = MagicMock()
        mock_prs.slides.add_slide.return_value = mock_slide
        mock_presentation.return_value = mock_prs

        handler.create_content("Title\nBody")

        mock_prs.slides.add_slide.assert_called()
        mock_prs.save.assert_called()
