"""Tests for widget domain management and the resolve_widget port."""

from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.ports import _normalise_domain, resolve_widget

# ---------------------------------------------------------------------------
# Domain normalisation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://acme.example", "acme.example"),
        ("http://acme.example/some/path", "acme.example"),
        ("https://acme.example:8080/path?query=1", "acme.example"),
        ("ACME.EXAMPLE", "acme.example"),
        ("localhost:3000", "localhost"),
        ("localhost", "localhost"),
        ("sub.domain.example.com", "sub.domain.example.com"),
    ],
)
def test_normalise_domain(raw, expected):
    assert _normalise_domain(raw) == expected


# ---------------------------------------------------------------------------
# add_widget_domain
# ---------------------------------------------------------------------------


def _make_widget_db(existing_domains=None):
    """Return a Firestore mock with an existing widget document."""
    existing = existing_domains or []

    widget_data = {"allowed_domains": existing, "tenant_id": "tenant-a"}
    widget_doc = MagicMock()
    widget_doc.exists = True
    widget_doc.to_dict.return_value = widget_data

    widget_ref = MagicMock()
    widget_ref.get.return_value = widget_doc

    widgets_col = MagicMock()
    widgets_col.document.return_value = widget_ref

    tenant_data = {"widget_id": "wgt_abc123456789", "status": "active"}
    tenant_doc = MagicMock()
    tenant_doc.exists = True
    tenant_doc.to_dict.return_value = tenant_data

    tenant_ref = MagicMock()
    tenant_ref.get.return_value = tenant_doc

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()

    def col_side(name):
        if name == "widgets":
            return widgets_col
        return tenants_col

    db.collection.side_effect = col_side
    return db, widget_ref


@patch("app.modules.identity.service.get_firestore_client")
def test_add_widget_domain_normalises_input(mock_get_db):
    """Domains must be stored normalised (no scheme, port, or path)."""
    db, _widget_ref = _make_widget_db()
    mock_get_db.return_value = db

    result = service.add_widget_domain("tenant-a", "https://acme.example:8080/path")

    assert "acme.example" in result.domains


@patch("app.modules.identity.service.get_firestore_client")
def test_add_widget_domain_deduplicates(mock_get_db):
    """Adding an already-present domain must be a no-op (idempotent)."""
    db, widget_ref = _make_widget_db(existing_domains=["acme.example"])
    mock_get_db.return_value = db

    result = service.add_widget_domain("tenant-a", "acme.example")

    # set() must not have been called again — no duplicate written.
    widget_ref.set.assert_not_called()
    assert result.domains.count("acme.example") == 1


@patch("app.modules.identity.service.get_firestore_client")
def test_add_widget_domain_rejects_wildcard(mock_get_db):
    """Wildcard domains must be rejected."""
    db, _ = _make_widget_db()
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.add_widget_domain("tenant-a", "*.example.com")

    assert exc_info.value.code == "wildcard_not_allowed"


@patch("app.modules.identity.service.get_firestore_client")
def test_add_widget_domain_allows_localhost(mock_get_db):
    """'localhost' must be an accepted domain."""
    db, _ = _make_widget_db()
    mock_get_db.return_value = db

    result = service.add_widget_domain("tenant-a", "localhost")
    assert "localhost" in result.domains


@patch("app.modules.identity.service.get_firestore_client")
def test_add_widget_domain_enforces_max_20(mock_get_db):
    """Adding a 21st domain must be rejected."""
    existing = [f"domain{i}.example.com" for i in range(20)]
    db, _ = _make_widget_db(existing_domains=existing)
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.add_widget_domain("tenant-a", "newdomain.example.com")

    assert exc_info.value.code == "domain_limit_reached"


# ---------------------------------------------------------------------------
# resolve_widget port
# ---------------------------------------------------------------------------


def _make_resolve_db(
    widget_exists=True,
    allowed_domains=None,
    tenant_exists=True,
    tenant_status="active",
    tenant_id="tenant-a",
):
    """Build a Firestore mock for resolve_widget tests."""
    allowed = allowed_domains or ["acme.example"]

    widget_data = {"tenant_id": tenant_id, "allowed_domains": allowed}
    widget_doc = MagicMock()
    widget_doc.exists = widget_exists
    widget_doc.to_dict.return_value = widget_data

    widget_ref = MagicMock()
    widget_ref.get.return_value = widget_doc

    widgets_col = MagicMock()
    widgets_col.document.return_value = widget_ref

    tenant_data = {"status": tenant_status}
    tenant_doc = MagicMock()
    tenant_doc.exists = tenant_exists
    tenant_doc.to_dict.return_value = tenant_data

    tenant_ref = MagicMock()
    tenant_ref.get.return_value = tenant_doc

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()

    def col_side(name):
        if name == "widgets":
            return widgets_col
        return tenants_col

    db.collection.side_effect = col_side
    return db


@patch("app.modules.identity.ports.get_firestore_client")
def test_resolve_widget_returns_tenant_id(mock_get_db):
    """resolve_widget returns the correct tenant_id for a known widget + valid domain."""
    mock_get_db.return_value = _make_resolve_db()
    result = resolve_widget("wgt_abc123", "https://acme.example/page")
    assert result == "tenant-a"


@patch("app.modules.identity.ports.get_firestore_client")
def test_resolve_widget_unknown_widget_raises(mock_get_db):
    """An unknown widget_id must raise ValueError."""
    mock_get_db.return_value = _make_resolve_db(widget_exists=False)
    with pytest.raises(ValueError, match="Unknown widget"):
        resolve_widget("wgt_bad", "https://acme.example")


@patch("app.modules.identity.ports.get_firestore_client")
def test_resolve_widget_unlisted_domain_raises(mock_get_db):
    """An origin not in allowed_domains must raise ValueError."""
    mock_get_db.return_value = _make_resolve_db(allowed_domains=["acme.example"])
    with pytest.raises(ValueError, match="not authorised"):
        resolve_widget("wgt_abc123", "https://evil.example")


@patch("app.modules.identity.ports.get_firestore_client")
def test_resolve_widget_inactive_tenant_raises(mock_get_db):
    """An inactive tenant must raise ValueError."""
    mock_get_db.return_value = _make_resolve_db(tenant_status="suspended")
    with pytest.raises(ValueError, match="not active"):
        resolve_widget("wgt_abc123", "https://acme.example")


@patch("app.modules.identity.ports.get_firestore_client")
def test_resolve_widget_normalises_origin(mock_get_db):
    """resolve_widget must normalise the origin before comparing to stored domains."""
    # Stored as "acme.example", origin has https:// and a port.
    mock_get_db.return_value = _make_resolve_db(allowed_domains=["acme.example"])
    result = resolve_widget("wgt_abc123", "https://acme.example:3000/page")
    assert result == "tenant-a"
