"""Tests for POST /billing/{tenant_id}/checkout (Stripe path)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.modules.billing.plans import TRIAL_PLAN_ID
from app.modules.billing.schemas import SubscriptionStatus
from app.shared.auth import get_current_user

TENANT_ID = "tenant-checkout-test"

OWNER_CLAIMS = {
    "uid": "uid-owner-1",
    "email": "owner@acme.com",
    "role": "company_owner",
    "tenant_id": TENANT_ID,
    "name": "Owner",
}

ADMIN_CLAIMS = {
    "uid": "uid-admin-1",
    "email": "admin@acme.com",
    "role": "company_admin",
    "tenant_id": TENANT_ID,
    "name": "Admin",
}


def _sub_doc_dict(stripe_customer_id: str | None = None) -> dict:
    now = datetime.now(UTC)
    data = {
        "subscription_id": "sub-1",
        "tenant_id": TENANT_ID,
        "plan_id": TRIAL_PLAN_ID,
        "status": SubscriptionStatus.TRIAL.value,
        "trial_end": now + timedelta(days=14),
        "created_at": now,
        "updated_at": now,
    }
    if stripe_customer_id:
        data["stripe_customer_id"] = stripe_customer_id
    return data


def _client(claims: dict) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: claims
    return TestClient(app)


def _teardown():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth tests — no Stripe calls needed
# ---------------------------------------------------------------------------


def test_admin_cannot_initiate_checkout():
    """POST /checkout is owner-only. Admin must receive 403."""
    client = _client(ADMIN_CLAIMS)
    try:
        resp = client.post(
            f"/api/v1/billing/{TENANT_ID}/checkout",
            json={"provider": "stripe", "plan_id": "professional"},
        )
    finally:
        _teardown()

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


@patch("app.modules.billing.service.get_db")
def test_checkout_rejects_trial_plan(mock_get_db):
    """Attempting to checkout the trial plan returns 400."""
    doc = MagicMock()
    doc.to_dict.return_value = _sub_doc_dict()
    doc.reference = MagicMock()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    client = _client(OWNER_CLAIMS)
    try:
        with patch("app.modules.billing.service.settings") as mock_settings:
            mock_settings.STRIPE_SECRET_KEY = "sk_test_key"
            mock_settings.STRIPE_PRICE_PROFESSIONAL = "price_pro"
            mock_settings.STRIPE_PRICE_ENTERPRISE = "price_ent"
            mock_settings.STRIPE_SUCCESS_URL = "http://localhost:3000/success"
            mock_settings.STRIPE_CANCEL_URL = "http://localhost:3000/cancel"
            resp = client.post(
                f"/api/v1/billing/{TENANT_ID}/checkout",
                json={"provider": "stripe", "plan_id": "starter"},
            )
    finally:
        _teardown()

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_plan"


@patch("app.modules.billing.service.get_db")
def test_checkout_rejects_unknown_plan(mock_get_db):
    """Unknown plan_id returns 400."""
    doc = MagicMock()
    doc.to_dict.return_value = _sub_doc_dict()
    doc.reference = MagicMock()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    client = _client(OWNER_CLAIMS)
    try:
        with patch("app.modules.billing.service.settings") as mock_settings:
            mock_settings.STRIPE_SECRET_KEY = "sk_test_key"
            mock_settings.STRIPE_PRICE_PROFESSIONAL = "price_pro"
            mock_settings.STRIPE_PRICE_ENTERPRISE = "price_ent"
            mock_settings.STRIPE_SUCCESS_URL = "http://localhost:3000/success"
            mock_settings.STRIPE_CANCEL_URL = "http://localhost:3000/cancel"
            resp = client.post(
                f"/api/v1/billing/{TENANT_ID}/checkout",
                json={"provider": "stripe", "plan_id": "nonexistent"},
            )
    finally:
        _teardown()

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_plan"


# ---------------------------------------------------------------------------
# Happy path — Stripe checkout
# ---------------------------------------------------------------------------


@patch("app.modules.billing.service.stripe")
@patch("app.modules.billing.service.get_db")
def test_stripe_checkout_creates_customer_and_returns_url(mock_get_db, mock_stripe):
    """First checkout creates a Stripe Customer and returns a session URL."""
    doc = MagicMock()
    doc.to_dict.return_value = _sub_doc_dict()  # no stripe_customer_id yet
    doc.reference = MagicMock()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    mock_stripe.Customer.create.return_value = MagicMock(id="cus_test123")
    mock_stripe.checkout.Session.create.return_value = MagicMock(
        id="cs_test456",
        url="https://checkout.stripe.com/pay/cs_test456",
    )

    client = _client(OWNER_CLAIMS)
    try:
        with patch("app.modules.billing.service.settings") as mock_settings:
            mock_settings.STRIPE_SECRET_KEY = "sk_test_key"
            mock_settings.STRIPE_PRICE_PROFESSIONAL = "price_pro_123"
            mock_settings.STRIPE_PRICE_ENTERPRISE = "price_ent_456"
            mock_settings.STRIPE_SUCCESS_URL = "http://localhost:3000/success"
            mock_settings.STRIPE_CANCEL_URL = "http://localhost:3000/cancel"

            resp = client.post(
                f"/api/v1/billing/{TENANT_ID}/checkout",
                json={"provider": "stripe", "plan_id": "professional"},
            )
    finally:
        _teardown()

    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["checkout_url"] == "https://checkout.stripe.com/pay/cs_test456"
    assert body["data"]["provider"] == "stripe"

    # Customer was created and stored back on the subscription doc.
    mock_stripe.Customer.create.assert_called_once()
    create_kwargs = mock_stripe.Customer.create.call_args.kwargs
    assert create_kwargs["metadata"] == {"tenant_id": TENANT_ID}
    assert create_kwargs["idempotency_key"] == f"margo-customer-{TENANT_ID}"
    doc.reference.update.assert_called_once()

    # Session was created with correct price and metadata.
    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert call_kwargs["mode"] == "subscription"
    assert call_kwargs["line_items"][0]["price"] == "price_pro_123"
    assert call_kwargs["metadata"]["tenant_id"] == TENANT_ID
    assert call_kwargs["metadata"]["plan_id"] == "professional"


@patch("app.modules.billing.service.stripe")
@patch("app.modules.billing.service.get_db")
def test_stripe_checkout_reuses_existing_customer(mock_get_db, mock_stripe):
    """Repeat checkout reuses the stored Stripe customer — no new customer created."""
    doc = MagicMock()
    doc.to_dict.return_value = {
        **_sub_doc_dict(),
        "stripe_customer_id": "cus_existing789",
    }
    doc.reference = MagicMock()
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    mock_stripe.checkout.Session.create.return_value = MagicMock(
        id="cs_test_2",
        url="https://checkout.stripe.com/pay/cs_test_2",
    )

    client = _client(OWNER_CLAIMS)
    try:
        with patch("app.modules.billing.service.settings") as mock_settings:
            mock_settings.STRIPE_SECRET_KEY = "sk_test_key"
            mock_settings.STRIPE_PRICE_PROFESSIONAL = "price_pro_123"
            mock_settings.STRIPE_PRICE_ENTERPRISE = "price_ent_456"
            mock_settings.STRIPE_SUCCESS_URL = "http://localhost:3000/success"
            mock_settings.STRIPE_CANCEL_URL = "http://localhost:3000/cancel"

            resp = client.post(
                f"/api/v1/billing/{TENANT_ID}/checkout",
                json={"provider": "stripe", "plan_id": "professional"},
            )
    finally:
        _teardown()

    assert resp.status_code == 200
    # Customer.create must NOT be called again.
    mock_stripe.Customer.create.assert_not_called()
    # Session.create must use the existing customer ID.
    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert call_kwargs["customer"] == "cus_existing789"


# ---------------------------------------------------------------------------
# Paystack placeholder
# ---------------------------------------------------------------------------


def test_paystack_checkout_returns_503_when_not_configured():
    """Paystack checkout returns 503 when the secret key is missing."""
    from app.core.config import settings

    settings.PAYSTACK_SECRET_KEY = ""

    client = _client(OWNER_CLAIMS)
    try:
        resp = client.post(
            f"/api/v1/billing/{TENANT_ID}/checkout",
            json={"provider": "paystack", "plan_id": "professional"},
        )
    finally:
        _teardown()

    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "paystack_not_configured"