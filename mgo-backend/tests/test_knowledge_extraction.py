"""Unit tests for knowledge.extractor — HTML, PDF, and Markdown extraction.

No network calls. PDF tests mock pypdf; HTML tests use real bs4/lxml with
small inline HTML strings. Markdown tests use stdlib only.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.modules.knowledge.extractor import (
    _clean_text,
    extract_html,
    extract_markdown,
    extract_pdf,
)

# ---------------------------------------------------------------------------
# HTML extraction
# ---------------------------------------------------------------------------


def _html(title: str, body: str) -> bytes:
    return f"<html><head><title>{title}</title></head><body>{body}</body></html>".encode()


def test_extract_html_basic():
    title, content = extract_html(_html("My Page", "<p>Hello world</p>"))
    assert title == "My Page"
    assert "Hello world" in content


def test_extract_html_uses_url_as_fallback_title():
    no_title_html = b"<html><body><p>Some text here</p></body></html>"
    title, content = extract_html(no_title_html, url="https://example.com/page")
    assert title == "https://example.com/page"
    assert "Some text here" in content


def test_extract_html_strips_script_and_style():
    html = (
        b"<html><head><style>body{color:red}</style></head>"
        b"<body><script>alert(1)</script><p>Real content</p></body></html>"
    )
    _, content = extract_html(html)
    assert "alert" not in content
    assert "color:red" not in content
    assert "Real content" in content


def test_extract_html_raises_on_empty_content():
    # Page with only whitespace / scripts — no actual text
    html = b"<html><head><script>var x=1;</script></head><body>  </body></html>"
    with pytest.raises(ValueError, match="No extractable text"):
        extract_html(html, url="https://example.com")


def test_extract_html_handles_malformed_html():
    # bs4/lxml is forgiving; should still extract text, not raise
    malformed = b"<p>Unclosed paragraph <b>bold text"
    title, content = extract_html(malformed, url="https://example.com")
    assert "bold text" in content


def test_extract_html_strips_nav_and_footer():
    html = (
        b"<html><body>"
        b"<nav>Navigation stuff</nav>"
        b"<article><p>Article content</p></article>"
        b"<footer>Footer text</footer>"
        b"</body></html>"
    )
    _, content = extract_html(html)
    # Navigation and footer are discarded; article text remains
    assert "Article content" in content
    assert "Navigation stuff" not in content
    assert "Footer text" not in content


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------


def _make_mock_pdf(text_per_page: list[str], title: str = "") -> MagicMock:
    """Return a mock PdfReader with pages that return given text."""
    mock_reader = MagicMock()
    mock_reader.metadata = MagicMock()
    mock_reader.metadata.title = title or None

    pages = []
    for text in text_per_page:
        p = MagicMock()
        p.extract_text.return_value = text
        pages.append(p)
    mock_reader.pages = pages
    return mock_reader


def test_extract_pdf_raises_on_non_pdf_bytes():
    with pytest.raises(ValueError, match="%PDF-"):
        extract_pdf(b"This is not a PDF file")


def test_extract_pdf_success():
    fake_pdf = b"%PDF-1.4 fake pdf bytes"
    mock_reader = _make_mock_pdf(["Page one content", "Page two content"], title="My Doc")

    with patch("pypdf.PdfReader", return_value=mock_reader):
        title, content = extract_pdf(fake_pdf)

    assert title == "My Doc"
    assert "Page one content" in content
    assert "Page two content" in content


def test_extract_pdf_uses_empty_title_when_no_metadata():
    fake_pdf = b"%PDF-1.4 fake"
    mock_reader = _make_mock_pdf(["Some text content"])
    mock_reader.metadata = None  # No metadata at all

    with patch("pypdf.PdfReader", return_value=mock_reader):
        title, content = extract_pdf(fake_pdf)

    assert title == ""
    assert "Some text content" in content


def test_extract_pdf_raises_on_no_text():
    """Image-only PDF: all pages return empty strings → ValueError."""
    fake_pdf = b"%PDF-1.4 fake"
    mock_reader = _make_mock_pdf(["", "   ", None])
    mock_reader.pages[2].extract_text.return_value = None

    with patch("pypdf.PdfReader", return_value=mock_reader):
        with pytest.raises(ValueError, match="no extractable text"):
            extract_pdf(fake_pdf)


def test_extract_pdf_survives_unreadable_page():
    """A single page that raises should not abort extraction."""
    fake_pdf = b"%PDF-1.4 fake"
    mock_reader = MagicMock()
    mock_reader.metadata = None

    good_page = MagicMock()
    good_page.extract_text.return_value = "Good page text"

    bad_page = MagicMock()
    bad_page.extract_text.side_effect = RuntimeError("corrupt page")

    mock_reader.pages = [good_page, bad_page]

    with patch("pypdf.PdfReader", return_value=mock_reader):
        title, content = extract_pdf(fake_pdf)

    assert "Good page text" in content


# ---------------------------------------------------------------------------
# Markdown extraction
# ---------------------------------------------------------------------------


def test_extract_markdown_basic():
    md = b"# My Title\n\nSome paragraph text here."
    title, content = extract_markdown(md)
    assert title == "My Title"
    assert "Some paragraph text here" in content


def test_extract_markdown_no_h1_gives_empty_title():
    md = b"## Subheading\n\nSome content below."
    title, content = extract_markdown(md)
    assert title == ""
    assert "Some content below" in content


def test_extract_markdown_strips_syntax():
    md = b"# Title\n\n**Bold** and _italic_ and `code` here."
    _, content = extract_markdown(md)
    # Markdown markers should be removed
    assert "**" not in content
    assert "_italic_" not in content
    # Underlying text should remain
    assert "Bold" in content
    assert "italic" in content


def test_extract_markdown_raises_on_non_utf8():
    with pytest.raises(ValueError, match="UTF-8"):
        extract_markdown(b"\xff\xfe invalid utf8 bytes")


def test_extract_markdown_raises_on_empty_file():
    with pytest.raises(ValueError, match="empty"):
        extract_markdown(b"   \n  \n")


def test_extract_markdown_strips_links():
    md = b"# T\n\nSee [this link](https://example.com) for details."
    _, content = extract_markdown(md)
    assert "this link" in content
    assert "https://example.com" not in content


# ---------------------------------------------------------------------------
# _clean_text — truncation
# ---------------------------------------------------------------------------


def test_clean_text_truncates_at_configured_limit():
    # Patch the limit to something small so the test is fast
    long_text = "a" * 10_000
    with patch("app.modules.knowledge.extractor.settings") as mock_s:
        mock_s.KNOWLEDGE_MAX_CONTENT_CHARS = 100
        result = _clean_text(long_text)
    assert len(result) == 100


def test_clean_text_does_not_truncate_short_content():
    text = "Short text."
    with patch("app.modules.knowledge.extractor.settings") as mock_s:
        mock_s.KNOWLEDGE_MAX_CONTENT_CHARS = 10_000
        result = _clean_text(text)
    assert result == text


def test_clean_text_collapses_blank_lines():
    text = "Line one\n\n\n\nLine two"
    with patch("app.modules.knowledge.extractor.settings") as mock_s:
        mock_s.KNOWLEDGE_MAX_CONTENT_CHARS = 10_000
        result = _clean_text(text)
    assert "\n\n\n" not in result
    assert "Line one" in result
    assert "Line two" in result
