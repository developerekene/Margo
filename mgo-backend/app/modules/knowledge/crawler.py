"""Bounded website page discovery for the knowledge crawl endpoint.

Discovers the set of pages to crawl from a starting URL.
Called synchronously during the POST /crawl request — it fetches at most
two external resources (sitemap + landing page) with explicit timeouts,
so it completes within the web server's request deadline.

Discovery algorithm (approved in Phase 1 Decision 4):
  1. Fetch {start_url}/sitemap.xml. If valid XML, extract all <loc> URLs
     matching the allowed host.
  2. If no sitemap, fetch the start URL and extract <a href> same-host links.
  3. Normalise all URLs (strip fragments, strip query strings).
  4. Deduplicate.
  5. Filter to same host only.
  6. Cap at KNOWLEDGE_MAX_CRAWL_PAGES.

SSRF note
---------
DNS rebinding cannot be fully prevented in the discovery step without doing
a DNS lookup here (which would be slow and add complexity). The SSRF guard
in url_validation.py already rejects IP literals and known private ranges.
The Cloud Tasks worker revalidates the destination before fetching.

Redirect handling
-----------------
httpx follows redirects by default (up to 5 hops). The final URL after
redirects is used for content extraction; it is not re-validated against the
allowed-domain list at discovery time (the task worker re-validates).
"""

import hashlib
import logging
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

from app.core.config import settings

logger = logging.getLogger("margo")


# ---------------------------------------------------------------------------
# URL normalisation helpers
# ---------------------------------------------------------------------------


def _normalise_url(url: str, base: str) -> str | None:
    """Resolve a potentially-relative URL against ``base`` and strip
    fragments and query strings.

    Returns None if the resulting URL is not http/https.
    """
    try:
        resolved = urljoin(base, url.strip())
        parsed = urlparse(resolved)
        if parsed.scheme not in ("http", "https"):
            return None
        # Strip fragment and query string — treat as the same page.
        clean = urlunparse(parsed._replace(query="", fragment=""))
        return clean
    except Exception:
        return None


def _same_host(url: str, allowed_host: str) -> bool:
    """Return True if url's hostname exactly matches allowed_host."""
    try:
        return urlparse(url).hostname == allowed_host
    except Exception:
        return False


def _url_page_id(url: str) -> str:
    """Deterministic page identifier from normalised URL (sha256 hex, 16 chars)."""
    return hashlib.sha256(url.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# HTTP fetch helper
# ---------------------------------------------------------------------------


def _fetch(url: str, timeout: int) -> httpx.Response | None:
    """Fetch a URL with a fixed timeout. Returns None on any error."""
    try:
        response = httpx.get(
            url,
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "MargoBot/1.0 (+https://margo.ai/bot)"},
        )
        return response
    except Exception as exc:
        logger.info("Discovery fetch failed: url=%s error=%s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Sitemap discovery
# ---------------------------------------------------------------------------


def _discover_from_sitemap(start_url: str, allowed_host: str, timeout: int) -> list[str]:
    """Try to fetch and parse {start_url}/sitemap.xml.

    Returns a list of normalised same-host URLs, or an empty list if the
    sitemap is absent, malformed, or contains no matching URLs.
    """
    parsed_base = urlparse(start_url)
    sitemap_url = urlunparse(parsed_base._replace(path="/sitemap.xml", query="", fragment=""))

    response = _fetch(sitemap_url, timeout)
    if response is None or response.status_code != 200:
        return []

    content_type = response.headers.get("content-type", "")
    if "xml" not in content_type and not response.text.strip().startswith("<?xml"):
        return []

    try:
        # stdlib xml is sufficient for <loc> extraction.
        import xml.etree.ElementTree as ET
        root = ET.fromstring(response.text)
        # Strip XML namespace prefix from tag names.
        locs = [
            elem.text.strip()
            for elem in root.iter()
            if elem.tag.endswith("loc") and elem.text
        ]
    except Exception as exc:
        logger.info("Sitemap parse failed: %s", exc)
        return []

    urls = []
    for loc in locs:
        normalised = _normalise_url(loc, start_url)
        if normalised and _same_host(normalised, allowed_host):
            urls.append(normalised)

    logger.info("Sitemap discovered %d same-host URLs at %s", len(urls), sitemap_url)
    return urls


# ---------------------------------------------------------------------------
# Anchor-extraction discovery
# ---------------------------------------------------------------------------


def _discover_from_landing_page(
    start_url: str, allowed_host: str, timeout: int
) -> list[str]:
    """Fetch the start URL and extract <a href> links from the same host.

    Returns an empty list on any failure.
    """
    response = _fetch(start_url, timeout)
    if response is None or response.status_code != 200:
        return []

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type:
        return []

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.content, "lxml")
    except Exception as exc:
        logger.info("Landing page parse failed: %s", exc)
        return []

    urls = []
    for tag in soup.find_all("a", href=True):
        normalised = _normalise_url(tag["href"], start_url)
        if normalised and _same_host(normalised, allowed_host):
            urls.append(normalised)

    logger.info(
        "Landing page discovered %d same-host links at %s", len(urls), start_url
    )
    return urls


# ---------------------------------------------------------------------------
# Public discovery function
# ---------------------------------------------------------------------------


class DiscoveredPage:
    """A single discovered page ready for task dispatch."""

    __slots__ = ("page_id", "url")

    def __init__(self, url: str):
        self.url = url
        self.page_id = _url_page_id(url)


def discover_pages(start_url: str) -> list[DiscoveredPage]:
    """Discover pages to crawl from ``start_url``.

    Returns a list of DiscoveredPage objects, capped at
    KNOWLEDGE_MAX_CRAWL_PAGES. The start URL itself is always included.

    Never raises — returns at minimum [start_url] on any discovery failure,
    so the caller always has at least one page to process.
    """
    timeout = settings.KNOWLEDGE_CRAWL_TIMEOUT_SECONDS
    max_pages = settings.KNOWLEDGE_MAX_CRAWL_PAGES

    allowed_host = urlparse(start_url).hostname or ""

    # Always include the start URL.
    candidate_urls: list[str] = [start_url]

    # Try sitemap first.
    sitemap_urls = _discover_from_sitemap(start_url, allowed_host, timeout)
    if sitemap_urls:
        candidate_urls.extend(sitemap_urls)
    else:
        # Fall back to anchor extraction from the landing page.
        anchor_urls = _discover_from_landing_page(start_url, allowed_host, timeout)
        candidate_urls.extend(anchor_urls)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for url in candidate_urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)

    # Apply hard cap.
    capped = unique[:max_pages]

    logger.info(
        "Page discovery complete: start=%s discovered=%d capped=%d",
        start_url,
        len(unique),
        len(capped),
    )
    return [DiscoveredPage(url) for url in capped]
