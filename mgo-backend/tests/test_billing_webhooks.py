"""Tests for POST /billing/webhooks/stripe.

These tests verify:
1. Signature verification rejects tampered/unsigned payloads.
2. Each supported event type triggers the correct handler.
3. Unknown event types are silently ignored (200 returned).
4. Handler failures return 200 (Stripe retry idempotency).

stripe.Webhook.construct_event is mocked so tests run without a real Stripe key.
"""

import json
from unittest.mock import MagicMock, patch

import stripe
from fastapi.testclient import TestClient

from app.main import app

WEBHOOK_URL = "/api/v1/billing/webhooks/stripe"
FAKE_SIG = "t=1234,v1=fakesig"


def _event(event_type: str, data: dict) -> dict:
    """Build a minimal Stripe event dict."""
    return {
        "id": f"evt_test_{event_type.replace('.', '_')}",
        "type": event_type,
        "data": {"object": data},
    }


def _post(client: TestClient, event: dict, sig: str = FAKE_SIG) -> any:
    return client.post(
        WEBHOOK_URL,
        content=json.dumps(event).encode(),
        headers={
            "content-type": "application/json",
            "stripe-signature": sig,
        },
    )


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


def test_invalid_signature_returns_400():
    """Tampered or unsigned webhook payloads must be rejected with 400."""
    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        with patch("app.modules.billing.api.stripe.Webhook.construct_event") as mock_verify:
            mock_verify.side_effect = stripe.error.SignatureVerificationError(
                "Bad sig", FAKE_SIG
            )
            client = TestClient(app)
            resp = _post(client, _event("checkout.session.completed", {}))

    assert resp.status_code == 400


def test_missing_webhook_secret_returns_503():
    """Webhook endpoint with no secret configured returns 503."""
    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = ""
        client = TestClient(app)
        resp = _post(client, _event("checkout.session.completed", {}))

    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Event dispatch
# ---------------------------------------------------------------------------


@patch("app.modules.billing.webhooks.get_db")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_checkout_session_completed_dispatches(mock_verify, mock_get_db):
    """checkout.session.completed is dispatched and returns 200."""
    event = _event(
        "checkout.session.completed",
        {
            "customer": "cus_123",
            "subscription": "sub_abc",
            "metadata": {"tenant_id": "t-1", "plan_id": "professional"},
        },
    )
    mock_verify.return_value = event

    # No subscription found — handler logs and returns cleanly.
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = []

    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        client = TestClient(app)
        resp = _post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True


@patch("app.modules.billing.webhooks.get_db")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_invoice_payment_failed_dispatches(mock_verify, mock_get_db):
    """invoice.payment_failed is dispatched and returns 200."""
    event = _event("invoice.payment_failed", {"customer": "cus_123"})
    mock_verify.return_value = event

    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = []

    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        client = TestClient(app)
        resp = _post(client, event)

    assert resp.status_code == 200


@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_unknown_event_type_ignored(mock_verify):
    """Events with unrecognised types are silently acknowledged."""
    event = _event("some.unhandled.event", {})
    mock_verify.return_value = event

    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        client = TestClient(app)
        resp = _post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True


@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_handler_exception_still_returns_200(mock_verify):
    """If a handler raises, we still return 200 — Stripe must not retry."""
    event = _event("checkout.session.completed", {"metadata": {"tenant_id": "t-1"}})
    mock_verify.return_value = event

    with patch("app.modules.billing.api.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        with patch(
            "app.modules.billing.webhooks.handle_checkout_session_completed",
            side_effect=RuntimeError("DB offline"),
        ):
            client = TestClient(app)
            resp = _post(client, event)

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Handler unit tests — test Firestore writes directly
# ---------------------------------------------------------------------------


@patch("app.modules.billing.webhooks.get_db")
def test_checkout_completed_activates_subscription(mock_get_db):
    """checkout.session.completed updates status to ACTIVE and stores IDs."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_checkout_session_completed

    ref = MagicMock()
    doc = MagicMock()
    doc.reference = ref
    doc.to_dict.return_value = {
        "tenant_id": "t-1",
        "status": SubscriptionStatus.TRIAL.value,
    }
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    event = {
        "data": {
            "object": {
                "customer": "cus_123",
                "subscription": "sub_abc",
                "metadata": {"tenant_id": "t-1", "plan_id": "professional"},
            }
        }
    }

    handle_checkout_session_completed(event)

    ref.update.assert_called_once()
    update_data = ref.update.call_args[0][0]
    assert update_data["status"] == SubscriptionStatus.ACTIVE.value
    assert update_data["stripe_subscription_id"] == "sub_abc"
    assert update_data["plan_id"] == "professional"


@patch("app.modules.billing.webhooks.get_db")
def test_payment_failed_sets_past_due_and_grace_period(mock_get_db):
    """invoice.payment_failed sets PAST_DUE and writes grace_period_end."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_invoice_payment_failed

    ref = MagicMock()
    doc = MagicMock()
    doc.reference = ref
    doc.to_dict.return_value = {"tenant_id": "t-1"}
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    event = {"data": {"object": {"customer": "cus_123"}}}
    handle_invoice_payment_failed(event)

    ref.update.assert_called_once()
    update_data = ref.update.call_args[0][0]
    assert update_data["status"] == SubscriptionStatus.PAST_DUE.value
    assert "grace_period_end" in update_data
    assert update_data["grace_period_end"] is not None


@patch("app.modules.billing.webhooks.get_db")
def test_subscription_deleted_sets_cancelled(mock_get_db):
    """customer.subscription.deleted sets status to CANCELLED."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_subscription_deleted

    ref = MagicMock()
    doc = MagicMock()
    doc.reference = ref
    doc.to_dict.return_value = {"tenant_id": "t-1"}
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]

    event = {"data": {"object": {"customer": "cus_123"}}}
    handle_subscription_deleted(event)

    ref.update.assert_called_once()
    assert ref.update.call_args[0][0]["status"] == SubscriptionStatus.CANCELLED.value
