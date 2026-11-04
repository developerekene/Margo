"""Tests for GET /billing/{tenant_id}/subscription.

These tests mock Firestore and the shared auth dependency so they run
without a live Firebase emulator.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.modules.billing.plans import PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import SubscriptionStatus, UsageSummary
from app.shared.auth import get_current_user

@pytest.fixture(autouse=True)
def _stub_usage():
    """Usage is read through billing.ports; these tests only cover the route."""
    with patch(
        "app.modules.billing.service._usage_summary", return_value=UsageSummary()
    ):
        yield

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

OWNER_CLAIMS = {
    "uid": "uid-owner-1",
    "email": "owner@acme.com",
    "role": "company_owner",
    "tenant_id": "tenant-acme",
    "name": "Owner",
}

ADMIN_CLAIMS = {
    "uid": "uid-admin-1",
    "email": "admin@acme.com",
    "role": "company_admin",
    "tenant_id": "tenant-acme",
    "name": "Admin",
}

PLATFORM_CLAIMS = {
    "uid": "uid-platform-1",
    "email": "platform@margo.io",
    "role": "platform_admin",
    "tenant_id": None,
    "name": "Platform Admin",
}

OTHER_TENANT_CLAIMS = {
    "uid": "uid-other-1",
    "email": "owner@rival.com",
    "role": "company_owner",
    "tenant_id": "tenant-rival",
    "name": "Other Owner",
}

TENANT_ID = "tenant-acme"


def _mock_sub_doc(status=SubscriptionStatus.TRIAL, plan_id=TRIAL_PLAN_ID):
    """Build a minimal Firestore subscription document dict."""
    now = datetime.now(UTC)
    return {
        "subscription_id": "sub-test-1",
        "tenant_id": TENANT_ID,
        "plan_id": plan_id,
        "status": status.value,
        "trial_end": now + timedelta(days=14),
        "current_period_end": None,
        "provider": None,
        "created_at": now,
        "updated_at": now,
    }


def _client_with_user(claims: dict) -> TestClient:
    """Return a TestClient with auth dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: claims
    return TestClient(app)


def _teardown():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


@patch("app.modules.billing.service.get_db")
def test_owner_can_read_subscription(mock_get_db):
    """Company owner can read their own tenant's subscription."""
    doc = MagicMock()
    doc.to_dict.return_value = _mock_sub_doc()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    client = _client_with_user(OWNER_CLAIMS)
    try:
        resp = client.get(f"/api/v1/billing/{TENANT_ID}/subscription")
    finally:
        _teardown()

    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    data = body["data"]
    assert data["tenant_id"] == TENANT_ID
    assert data["plan_id"] == TRIAL_PLAN_ID
    assert data["status"] == SubscriptionStatus.TRIAL.value
    assert data["limits"]["users"] == PLANS[TRIAL_PLAN_ID].limits.users
    assert "usage" in data


@patch("app.modules.billing.service.get_db")
def test_admin_can_read_subscription(mock_get_db):
    """Company admin can read their own tenant's subscription."""
    doc = MagicMock()
    doc.to_dict.return_value = _mock_sub_doc()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    client = _client_with_user(ADMIN_CLAIMS)
    try:
        resp = client.get(f"/api/v1/billing/{TENANT_ID}/subscription")
    finally:
        _teardown()

    assert resp.status_code == 200
    assert resp.json()["error"] is None


@patch("app.modules.billing.service.get_db")
def test_platform_admin_can_read_any_tenant_subscription(mock_get_db):
    """Platform admin can read subscriptions for any tenant (cross-tenant)."""
    doc = MagicMock()
    doc.to_dict.return_value = _mock_sub_doc()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    client = _client_with_user(PLATFORM_CLAIMS)
    try:
        resp = client.get(f"/api/v1/billing/{TENANT_ID}/subscription")
    finally:
        _teardown()

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Authorization rejection tests (no Firestore call needed)
# ---------------------------------------------------------------------------


def test_other_tenant_owner_is_rejected():
    """An owner from a different tenant must receive 403."""
    client = _client_with_user(OTHER_TENANT_CLAIMS)
    try:
        resp = client.get(f"/api/v1/billing/{TENANT_ID}/subscription")
    finally:
        _teardown()

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Not-found test
# ---------------------------------------------------------------------------


@patch("app.modules.billing.service.get_db")
def test_missing_subscription_returns_404(mock_get_db):
    """Returns 404 when the tenant has no subscription document."""
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = []

    client = _client_with_user(OWNER_CLAIMS)
    try:
        resp = client.get(f"/api/v1/billing/{TENANT_ID}/subscription")
    finally:
        _teardown()

    assert resp.status_code == 404
    body = resp.json()
    assert body["data"] is None
    assert body["error"]["code"] == "subscription_not_found"
