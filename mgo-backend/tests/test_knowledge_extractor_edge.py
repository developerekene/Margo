"""WI-11: Extractor edge cases — Markdown image/link parse order and empty PDF.

Verifies:
- Markdown images ![alt](url) produce alt text, not a stray "!" or the URL.
- An image is not mistakenly matched by the link pattern first.
- Mixed link + image: both are handled correctly.
- PDF with all empty pages raises ValueError.
- PDF with some empty pages extracts content from the non-empty ones.
"""

import io
from unittest.mock import MagicMock, patch

import pytest

from app.modules.knowledge.extractor import extract_markdown, extract_pdf, _strip_markdown


# ---------------------------------------------------------------------------
# _strip_markdown — image/link order
# ---------------------------------------------------------------------------


class TestStripMarkdownImageLinkOrder:
    def test_image_produces_alt_text_only(self):
        """![alt text](https://example.com/img.png) → 'alt text', no URL, no '!'."""
        result = _strip_markdown("![alt text](https://example.com/img.png)")
        assert "alt text" in result
        assert "https://example.com/img.png" not in result
        assert "!" not in result

    def test_image_not_mangled_by_link_rule(self):
        """The link rule must not leave a stray '!' prefix on images."""
        result = _strip_markdown("![logo](https://example.com/logo.png)")
        # If the link rule ran first it would produce "!logo"; the image rule
        # then finds no match and "!logo" stays in the output.
        assert not result.strip().startswith("!")

    def test_link_produces_link_text_only(self):
        """[click here](https://example.com) → 'click here', no URL."""
        result = _strip_markdown("[click here](https://example.com)")
        assert "click here" in result
        assert "https://example.com" not in result

    def test_mixed_image_and_link(self):
        """Both an image and a link in the same text are handled correctly."""
        md = "See ![screenshot](https://cdn.example.com/shot.png) and [docs](https://docs.example.com)."
        result = _strip_markdown(md)
        assert "screenshot" in result
        assert "docs" in result
        assert "!" not in result
        assert "https://" not in result

    def test_multiple_images_all_converted(self):
        """Multiple image references are all stripped correctly."""
        md = "![one](https://a.com/1.png) and ![two](https://b.com/2.png)"
        result = _strip_markdown(md)
        assert "one" in result
        assert "two" in result
        assert "!" not in result


# ---------------------------------------------------------------------------
# extract_markdown
# ---------------------------------------------------------------------------


class TestExtractMarkdown:
    def test_image_in_full_extraction(self):
        """extract_markdown returns the image alt text in content."""
        md = b"# Title\n\nSee ![diagram](https://example.com/d.png) for details."
        title, content = extract_markdown(md)
        assert title == "Title"
        assert "diagram" in content
        assert "!" not in content
        assert "https://" not in content

    def test_empty_markdown_raises(self):
        with pytest.raises(ValueError, match="empty"):
            extract_markdown(b"   \n  ")

    def test_non_utf8_raises(self):
        with pytest.raises(ValueError, match="UTF-8"):
            extract_markdown(b"\xff\xfe invalid bytes")


# ---------------------------------------------------------------------------
# extract_pdf — empty page handling
# ---------------------------------------------------------------------------


class TestExtractPdfEmptyPages:
    def _make_pdf_reader(self, page_texts: list[str | None]):
        """Build a mock PdfReader whose pages return the given texts."""
        pages = []
        for text in page_texts:
            page = MagicMock()
            page.extract_text.return_value = text
            pages.append(page)
        reader = MagicMock()
        reader.pages = pages
        reader.metadata = MagicMock()
        reader.metadata.title = None
        return reader

    def test_all_empty_pages_raises(self):
        """A PDF where every page returns empty text raises ValueError."""
        reader = self._make_pdf_reader(["", "", None])

        with patch("pypdf.PdfReader", return_value=reader):
            with pytest.raises(ValueError, match="no extractable text"):
                extract_pdf(b"%PDF-fake")

    def test_mixed_empty_and_non_empty_pages_succeeds(self):
        """Content is extracted from non-empty pages even if others are blank."""
        reader = self._make_pdf_reader(["", "Real content here.", None, "More text."])

        with patch("pypdf.PdfReader", return_value=reader):
            title, content = extract_pdf(b"%PDF-fake")

        assert "Real content here" in content
        assert "More text" in content

    def test_invalid_pdf_header_raises(self):
        with pytest.raises(ValueError, match="missing %PDF-"):
            extract_pdf(b"not a pdf")
