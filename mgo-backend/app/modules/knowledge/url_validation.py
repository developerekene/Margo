"""URL validation and SSRF protection for the knowledge crawl endpoint.

Validates that a crawl target URL:
  - Has a parseable structure.
  - Uses http or https only.
  - Has no embedded credentials.
  - Has a resolvable, non-private hostname.
  - Is in the tenant's widget allowed-domain list (exact match).

Also provides the domain normalisation function used for allowed-domain
comparison. This replicates identity.ports._normalise_domain intentionally —
knowledge cannot import from identity (import-linter rule).

SSRF protection strategy
------------------------
We check the hostname against known private IP ranges using Python's
``ipaddress`` module BEFORE making any network requests. We also reject
hostnames that resolve to private addresses (checked in the crawler, not
here, since DNS lookup is a blocking network call).

A hostname is blocked if it:
  - Is a loopback address (127.0.0.0/8 or ::1).
  - Is in RFC 1918 private ranges (10/8, 172.16/12, 192.168/16).
  - Is a link-local address (169.254/16, fe80::/10).
  - Is the GCP metadata endpoint (169.254.169.254).
  - Is an IPv6 unique-local address (fc00::/7).
  - Is a reserved/documentation range.

Subdomain/substring attack protection
--------------------------------------
Matching is performed on the EXACT normalised hostname.
"evil.example.com.attacker.test" does NOT match "example.com".
"""

import ipaddress
import logging
import re
from urllib.parse import urlparse

from app.core.responses import AppError
from app.shared.container import get_db
from app.modules.knowledge.constants import TENANTS_COLLECTION, WIDGETS_COLLECTION

logger = logging.getLogger("margo")

# Schemes that are safe to crawl.
_ALLOWED_SCHEMES = {"http", "https"}

# Private/reserved IP networks that must never be crawled.
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),        # loopback
    ipaddress.ip_network("10.0.0.0/8"),          # RFC 1918
    ipaddress.ip_network("172.16.0.0/12"),       # RFC 1918
    ipaddress.ip_network("192.168.0.0/16"),      # RFC 1918
    ipaddress.ip_network("169.254.0.0/16"),      # link-local / GCP metadata
    ipaddress.ip_network("0.0.0.0/8"),           # "this" network
    ipaddress.ip_network("100.64.0.0/10"),       # shared address space
    ipaddress.ip_network("192.0.0.0/24"),        # IETF Protocol Assignments
    ipaddress.ip_network("198.18.0.0/15"),       # benchmarking
    ipaddress.ip_network("198.51.100.0/24"),     # TEST-NET-2
    ipaddress.ip_network("203.0.113.0/24"),      # TEST-NET-3
    ipaddress.ip_network("240.0.0.0/4"),         # reserved
    ipaddress.ip_network("::1/128"),             # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),            # IPv6 unique-local
    ipaddress.ip_network("fe80::/10"),           # IPv6 link-local
    ipaddress.ip_network("::ffff:0:0/96"),       # IPv4-mapped IPv6
]


# ---------------------------------------------------------------------------
# Domain normalisation (mirrors identity.ports._normalise_domain)
# ---------------------------------------------------------------------------


def normalise_host(raw: str) -> str:
    """Strip scheme, port, path, and credentials from a URL-like string.

    Returns the bare lowercase hostname only.

    Examples:
        "https://ACME.example.com:8080/path?q=1" -> "acme.example.com"
        "acme.example.com"                        -> "acme.example.com"
    """
    without_scheme = re.sub(r"^https?://", "", raw.strip())
    # Drop credentials (user:pass@host -> host).
    if "@" in without_scheme:
        without_scheme = without_scheme.rsplit("@", 1)[1]
    host_part = without_scheme.split("/")[0]
    host_no_port = host_part.split(":")[0]
    return host_no_port.lower()


# ---------------------------------------------------------------------------
# IP-literal SSRF check
# ---------------------------------------------------------------------------


def is_private_ip(hostname: str) -> bool:
    """Return True if ``hostname`` is an IP address that falls in a blocked range.

    For hostnames (FQDNs), returns False — DNS-resolution checks happen later,
    in the crawl worker, using the same blocked-network list.
    """
    try:
        addr = ipaddress.ip_address(hostname)
    except ValueError:
        return False  # not an IP literal; FQDN — DNS checked in crawler

    return any(addr in net for net in _BLOCKED_NETWORKS)


# ---------------------------------------------------------------------------
# Full URL validation
# ---------------------------------------------------------------------------


def validate_crawl_url(url: str) -> str:
    """Parse and validate a crawl URL.

    Returns the normalised URL string on success.
    Raises AppError (400) on any validation failure.

    Checks performed:
      1. URL is parseable.
      2. Scheme is http or https.
      3. No embedded credentials.
      4. Hostname is present.
      5. Hostname is not a blocked private IP literal.
    """
    try:
        parsed = urlparse(url.strip())
    except Exception:
        raise AppError("invalid_url", "The provided URL could not be parsed.", 400)

    if not parsed.scheme:
        raise AppError(
            "invalid_url",
            "URL must include a scheme (http:// or https://).",
            400,
        )

    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise AppError(
            "invalid_url_scheme",
            f"URL scheme '{parsed.scheme}' is not allowed. Use http or https.",
            400,
        )

    if parsed.username or parsed.password:
        raise AppError(
            "invalid_url",
            "URLs with embedded credentials are not allowed.",
            400,
        )

    hostname = parsed.hostname
    if not hostname:
        raise AppError("invalid_url", "URL must include a hostname.", 400)

    if is_private_ip(hostname):
        raise AppError(
            "url_not_allowed",
            "Crawling private or internal network addresses is not permitted.",
            400,
        )

    # Reconstruct a clean URL (drop any fragment; keep query stripped at discovery time).
    clean = parsed._replace(fragment="").geturl()
    return clean


# ---------------------------------------------------------------------------
# Allowed-domain check against tenant's widget allowlist
# ---------------------------------------------------------------------------


def get_tenant_allowed_domains(db, tenant_id: str) -> list[str]:
    """Return the normalised allowed-domain list for a tenant's widget.

    Returns an empty list if the tenant has no widget or no domains configured.
    Raises AppError 404 if the tenant document does not exist.
    Raises AppError 503 on Firestore read errors.
    """
    try:
        tenant_doc = (
            db.collection(TENANTS_COLLECTION).document(tenant_id).get()
        )
    except Exception:
        logger.exception("Firestore error reading tenant doc for domain check: tenant=%s", tenant_id)
        raise AppError(
            "service_unavailable",
            "Could not verify allowed domains. Please try again.",
            503,
        )

    if not tenant_doc.exists:
        raise AppError("tenant_not_found", "Tenant not found.", 404)

    widget_id = tenant_doc.to_dict().get("widget_id")
    if not widget_id:
        return []

    try:
        widget_doc = db.collection(WIDGETS_COLLECTION).document(widget_id).get()
    except Exception:
        logger.exception("Firestore error reading widget for domain check: tenant=%s", tenant_id)
        raise AppError(
            "service_unavailable",
            "Could not verify allowed domains. Please try again.",
            503,
        )

    if not widget_doc.exists:
        return []

    return widget_doc.to_dict().get("allowed_domains", [])


def assert_domain_allowed(url: str, allowed_domains: list[str]) -> None:
    """Raise AppError 403 if the URL's hostname is not in the allowed-domain list.

    Comparison is EXACT after normalisation. "evil.example.com" does not
    match "example.com", and "example.com.attacker.test" does not match
    "example.com".
    """
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    if hostname not in allowed_domains:
        raise AppError(
            "domain_not_allowed",
            f"The domain '{hostname}' is not in this tenant's allowed-domain list. "
            "Add it via the widget-domains endpoint first.",
            403,
        )
