"""Unit tests for knowledge.url_validation — SSRF protection and domain checks.

Pure unit tests: no network, no Firestore, no GCS.
"""

import pytest

from app.core.responses import AppError
from app.modules.knowledge.url_validation import (
    assert_domain_allowed,
    get_tenant_allowed_domains,
    is_private_ip,
    normalise_host,
    validate_crawl_url,
)
from tests.fake_firestore import FakeDB

# ---------------------------------------------------------------------------
# normalise_host
# ---------------------------------------------------------------------------


def test_normalise_host_strips_scheme_port_path():
    assert normalise_host("https://ACME.example.com:8080/path?q=1") == "acme.example.com"


def test_normalise_host_bare_domain():
    assert normalise_host("example.com") == "example.com"


def test_normalise_host_strips_credentials():
    assert normalise_host("https://user:pass@example.com/") == "example.com"


def test_normalise_host_lowercases():
    assert normalise_host("EXAMPLE.COM") == "example.com"


# ---------------------------------------------------------------------------
# is_private_ip
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "addr",
    [
        "127.0.0.1",
        "10.0.0.1",
        "192.168.1.1",
        "172.16.0.1",
        "169.254.169.254",  # GCP metadata endpoint
        "::1",
    ],
)
def test_is_private_ip_true(addr):
    assert is_private_ip(addr) is True


def test_is_private_ip_false_for_public_ip():
    assert is_private_ip("8.8.8.8") is False


def test_is_private_ip_false_for_hostname():
    # FQDNs should not be treated as IPs
    assert is_private_ip("example.com") is False


# ---------------------------------------------------------------------------
# validate_crawl_url
# ---------------------------------------------------------------------------


def test_validate_crawl_url_accepts_https():
    result = validate_crawl_url("https://example.com/page")
    assert result.startswith("https://")


def test_validate_crawl_url_accepts_http():
    result = validate_crawl_url("http://example.com")
    assert "example.com" in result


def test_validate_crawl_url_rejects_ftp():
    with pytest.raises(AppError) as exc_info:
        validate_crawl_url("ftp://example.com/file")
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "invalid_url_scheme"


def test_validate_crawl_url_rejects_embedded_credentials():
    with pytest.raises(AppError) as exc_info:
        validate_crawl_url("https://user:pass@example.com/")
    assert exc_info.value.status_code == 400


def test_validate_crawl_url_rejects_private_ip():
    with pytest.raises(AppError) as exc_info:
        validate_crawl_url("http://192.168.1.1/admin")
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "url_not_allowed"


def test_validate_crawl_url_rejects_loopback():
    with pytest.raises(AppError) as exc_info:
        validate_crawl_url("http://127.0.0.1:8080/")
    assert exc_info.value.status_code == 400


def test_validate_crawl_url_rejects_gcp_metadata():
    with pytest.raises(AppError) as exc_info:
        validate_crawl_url("http://169.254.169.254/computeMetadata/v1/")
    assert exc_info.value.status_code == 400


def test_validate_crawl_url_strips_fragment():
    result = validate_crawl_url("https://example.com/page#section")
    assert "#section" not in result


# ---------------------------------------------------------------------------
# assert_domain_allowed — exact-match SSRF / subdomain protection
# ---------------------------------------------------------------------------


def test_assert_domain_allowed_exact_match_passes():
    # Should not raise
    assert_domain_allowed("https://example.com/page", allowed_domains=["example.com"])


def test_assert_domain_allowed_subdomain_attack_blocked():
    """evil.example.com.attacker.test must NOT match example.com."""
    with pytest.raises(AppError) as exc_info:
        assert_domain_allowed(
            "https://evil.example.com.attacker.test/",
            allowed_domains=["example.com"],
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "domain_not_allowed"


def test_assert_domain_allowed_subdomain_blocked():
    """sub.example.com must NOT match example.com (exact host match)."""
    with pytest.raises(AppError) as exc_info:
        assert_domain_allowed(
            "https://sub.example.com/page",
            allowed_domains=["example.com"],
        )
    assert exc_info.value.status_code == 403


def test_assert_domain_allowed_case_insensitive():
    # Hostname should be lowercased before comparison
    assert_domain_allowed("https://EXAMPLE.COM/page", allowed_domains=["example.com"])


def test_assert_domain_allowed_empty_list_blocks_all():
    with pytest.raises(AppError) as exc_info:
        assert_domain_allowed("https://example.com/page", allowed_domains=[])
    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# get_tenant_allowed_domains — Firestore integration
# ---------------------------------------------------------------------------


def test_get_tenant_allowed_domains_no_widget():
    db = FakeDB()
    db.put("tenants/t-1", {"tenant_id": "t-1"})  # no widget_id

    domains = get_tenant_allowed_domains(db, "t-1")
    assert domains == []


def test_get_tenant_allowed_domains_with_widget():
    db = FakeDB()
    db.put("tenants/t-1", {"tenant_id": "t-1", "widget_id": "w-1"})
    db.put("widgets/w-1", {"allowed_domains": ["example.com", "docs.example.com"]})

    domains = get_tenant_allowed_domains(db, "t-1")
    assert "example.com" in domains
    assert "docs.example.com" in domains


def test_get_tenant_allowed_domains_raises_404_for_missing_tenant():
    db = FakeDB()
    with pytest.raises(AppError) as exc_info:
        get_tenant_allowed_domains(db, "no-such-tenant")
    assert exc_info.value.status_code == 404


def test_get_tenant_allowed_domains_missing_widget_returns_empty():
    db = FakeDB()
    db.put("tenants/t-1", {"tenant_id": "t-1", "widget_id": "w-999"})
    # Widget document does not exist

    domains = get_tenant_allowed_domains(db, "t-1")
    assert domains == []
