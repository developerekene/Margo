"""Text extraction for the knowledge module.

Handles three content types:
  - HTML web pages (via BeautifulSoup + lxml)
  - PDF documents (via pypdf)
  - Markdown documents (stdlib only)

Design notes
------------
- Extraction is synchronous; callers run this in a Cloud Tasks worker, not in
  an async FastAPI handler, so blocking I/O is fine here.
- Extracted content is truncated to KNOWLEDGE_MAX_CONTENT_CHARS to protect
  the embedding pipeline from oversized inputs.
- File contents are never logged.
- Each function raises ValueError with a descriptive message on failure.
  Callers map ValueError to a 'failed' document/page status.
"""

import logging
import re

from app.core.config import settings

logger = logging.getLogger("margo")

# HTML tags whose content we always discard.
_DISCARD_TAGS = [
    "script", "style", "noscript", "nav", "footer", "header",
    "aside", "form", "button", "input", "select", "textarea",
    "meta", "link", "head",
]


# ---------------------------------------------------------------------------
# HTML extraction
# ---------------------------------------------------------------------------


def extract_html(html_bytes: bytes, url: str = "") -> tuple[str, str]:
    """Extract (title, content) from raw HTML bytes.

    Returns:
        (title, content) — both strings, content is cleaned plain text.

    Raises:
        ValueError if content cannot be extracted or is empty after cleaning.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise ValueError("beautifulsoup4 is not installed.") from exc

    try:
        soup = BeautifulSoup(html_bytes, "lxml")
    except Exception as exc:
        raise ValueError(f"HTML parsing failed: {exc}") from exc

    # Extract title.
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""

    # Remove noisy tags.
    for tag in soup.find_all(_DISCARD_TAGS):
        tag.decompose()

    # Extract text from body, or the whole document if no body.
    body = soup.find("body") or soup
    text = body.get_text(separator="\n")

    content = _clean_text(text)

    if not content:
        raise ValueError(f"No extractable text content found at {url!r}")

    return title or url, content


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------


def extract_pdf(pdf_bytes: bytes) -> tuple[str, str]:
    """Extract (title, content) from raw PDF bytes.

    Returns:
        (title, content) — title from PDF metadata if available, else empty.

    Raises:
        ValueError if the bytes are not a valid PDF or contain no text.
    """
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("File does not appear to be a valid PDF (missing %PDF- header).")

    try:
        import io
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError
    except ImportError as exc:
        raise ValueError("pypdf is not installed.") from exc

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError(f"PDF could not be opened: {exc}") from exc

    # Extract title from metadata.
    title = ""
    try:
        meta = reader.metadata
        if meta and meta.title:
            title = str(meta.title).strip()
    except Exception:
        pass  # Metadata is optional; a missing title is not a failure.

    # Extract text from all pages.
    parts: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
            parts.append(page_text)
        except Exception:
            # A single unreadable page is not fatal.
            continue

    content = _clean_text("\n".join(parts))

    if not content:
        raise ValueError("PDF contains no extractable text (may be image-only).")

    return title, content


# ---------------------------------------------------------------------------
# Markdown extraction
# ---------------------------------------------------------------------------


def extract_markdown(raw_bytes: bytes) -> tuple[str, str]:
    """Extract (title, content) from raw Markdown bytes.

    Title is taken from the first H1 heading, if present.
    Content is the full text with Markdown syntax stripped.

    Raises:
        ValueError if bytes are not valid UTF-8 or the file is empty.
    """
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"Markdown file is not valid UTF-8: {exc}") from exc

    if not text.strip():
        raise ValueError("Markdown file is empty.")

    # Extract H1 title (first line starting with a single #).
    title = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = stripped.lstrip("# ").strip()
            break

    # Strip Markdown syntax to get readable plain text.
    content = _strip_markdown(text)
    content = _clean_text(content)

    if not content:
        raise ValueError("Markdown file contains no readable text after stripping syntax.")

    return title, content


def _strip_markdown(text: str) -> str:
    """Remove common Markdown syntax, leaving readable prose."""
    # Fenced code blocks — keep code but remove fence markers.
    text = re.sub(r"```[^\n]*\n(.*?)```", r"\1", text, flags=re.DOTALL)
    # Inline code.
    text = re.sub(r"`[^`]+`", lambda m: m.group(0).strip("`"), text)
    # ATX headings (# Heading).
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Bold and italic.
    text = re.sub(r"\*{1,3}(.+?)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}(.+?)_{1,3}", r"\1", text)
    # Links: [text](url) -> text.
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Images: ![alt](url) -> alt.
    text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
    # Blockquotes.
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    # Horizontal rules.
    text = re.sub(r"^[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    # List markers.
    text = re.sub(r"^[\s]*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*\d+\.\s+", "", text, flags=re.MULTILINE)
    return text


# ---------------------------------------------------------------------------
# Shared text normalisation
# ---------------------------------------------------------------------------


def _clean_text(text: str) -> str:
    """Normalise whitespace and truncate to the configured content limit."""
    # Collapse runs of whitespace lines into a single blank line.
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse multiple spaces on a single line.
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = text.strip()

    max_chars = settings.KNOWLEDGE_MAX_CONTENT_CHARS
    if len(text) > max_chars:
        logger.info(
            "Extracted content truncated from %d to %d chars", len(text), max_chars
        )
        text = text[:max_chars]

    return text
