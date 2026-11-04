"""Tests for Stripe and Paystack billing webhooks.

These tests verify:
1. Provider signatures are verified before processing.
2. Supported event types are dispatched to their handlers.
3. Unknown event types are acknowledged and ignored.
4. Duplicate deliveries are handled idempotently by the webhook runner.
5. Processing failures return non-2xx responses so providers can retry.
6. Stripe and Paystack handlers queue the expected Firestore writes.

External provider APIs and Firestore are mocked so tests run without
real provider credentials or network access.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import stripe
from fastapi.testclient import TestClient

from app.main import app

STRIPE_WEBHOOK_URL = "/api/v1/billing/webhook/stripe"
PAYSTACK_WEBHOOK_URL = "/api/v1/billing/webhook/paystack"

FAKE_SIG = "t=1234,v1=fakesig"
STRIPE_SECRET = "whsec_test"
PAYSTACK_SECRET = "sk_test_paystack"


def _event(event_type: str, data: dict) -> dict:
    """Build a minimal Stripe event dictionary."""
    return {
        "id": f"evt_test_{event_type.replace('.', '_')}",
        "type": event_type,
        "created": 1_700_000_000,
        "data": {"object": data},
    }


def _paystack_event(event_type: str, data: dict) -> dict:
    """Build a minimal Paystack event dictionary."""
    return {
        "event": event_type,
        "data": data,
    }


def _stripe_post(client: TestClient, event: dict, sig: str = FAKE_SIG):
    """Send a Stripe webhook request."""
    return client.post(
        STRIPE_WEBHOOK_URL,
        content=json.dumps(event).encode(),
        headers={
            "content-type": "application/json",
            "stripe-signature": sig,
        },
    )


def _paystack_post(
    client: TestClient,
    event: dict,
    secret: str = PAYSTACK_SECRET,
):
    """Send a Paystack webhook request with a valid HMAC signature."""
    payload = json.dumps(event).encode()
    signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha512,
    ).hexdigest()

    return client.post(
        PAYSTACK_WEBHOOK_URL,
        content=payload,
        headers={
            "content-type": "application/json",
            "x-paystack-signature": signature,
        },
    )


def _subscription_db(subscription_data: dict):
    """Build a mocked Firestore subscription lookup."""
    db = MagicMock()
    batch = MagicMock()
    ref = MagicMock()
    doc = MagicMock()

    doc.reference = ref
    doc.to_dict.return_value = subscription_data

    (
        db.collection.return_value
        .where.return_value
        .limit.return_value
        .get.return_value
    ) = [doc]

    return db, batch, ref


# ---------------------------------------------------------------------------
# Stripe signature verification
# ---------------------------------------------------------------------------


def test_stripe_invalid_signature_returns_400():
    """Invalid Stripe signatures must be rejected."""
    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        with patch(
            "app.modules.billing.api.stripe.Webhook.construct_event",
            side_effect=stripe.SignatureVerificationError(
                "Bad signature",
                FAKE_SIG,
            ),
        ):
            client = TestClient(app)
            resp = _stripe_post(
                client,
                _event("checkout.session.completed", {}),
            )

    assert resp.status_code == 400
    assert resp.json()["error"]["message"] == "Invalid webhook signature."


def test_stripe_missing_webhook_secret_returns_503():
    """Stripe webhook endpoint without a configured secret returns 503."""
    with patch("app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET", ""):
        client = TestClient(app)
        resp = _stripe_post(
            client,
            _event("checkout.session.completed", {}),
        )

    assert resp.status_code == 503


def test_stripe_invalid_payload_returns_400():
    """Malformed Stripe payloads must be rejected."""
    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        with patch(
            "app.modules.billing.api.stripe.Webhook.construct_event",
            side_effect=ValueError("Invalid payload"),
        ):
            client = TestClient(app)
            resp = client.post(
                STRIPE_WEBHOOK_URL,
                content=b"not-json",
                headers={"stripe-signature": FAKE_SIG},
            )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Stripe event dispatch
# ---------------------------------------------------------------------------


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_stripe_checkout_session_completed_dispatches(
    mock_verify,
    mock_runner,
):
    """checkout.session.completed is dispatched to the webhook runner."""
    event = _event(
        "checkout.session.completed",
        {
            "customer": "cus_123",
            "subscription": "sub_abc",
            "payment_status": "paid",
            "metadata": {
                "tenant_id": "t-1",
                "plan_id": "professional",
            },
        },
    )
    mock_verify.return_value = event
    mock_runner.return_value = "processed"

    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        client = TestClient(app)
        resp = _stripe_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True
    assert resp.json()["data"]["outcome"] == "processed"
    mock_runner.assert_called_once()

    args = mock_runner.call_args.args
    assert args[0] == "stripe"
    assert args[1] == event["id"]
    assert args[2] == "checkout.session.completed"


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_stripe_invoice_payment_failed_dispatches(
    mock_verify,
    mock_runner,
):
    """invoice.payment_failed is dispatched to the webhook runner."""
    event = _event(
        "invoice.payment_failed",
        {"customer": "cus_123"},
    )
    mock_verify.return_value = event
    mock_runner.return_value = "processed"

    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        client = TestClient(app)
        resp = _stripe_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True
    mock_runner.assert_called_once()


@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_stripe_unknown_event_type_ignored(mock_verify):
    """Unrecognised Stripe events are acknowledged without processing."""
    event = _event("some.unhandled.event", {})
    mock_verify.return_value = event

    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        client = TestClient(app)
        resp = _stripe_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True
    assert resp.json()["data"]["outcome"] == "ignored"


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_stripe_duplicate_event_returns_200(
    mock_verify,
    mock_runner,
):
    """Duplicate Stripe deliveries are acknowledged."""
    event = _event(
        "checkout.session.completed",
        {"metadata": {"tenant_id": "t-1"}},
    )
    mock_verify.return_value = event
    mock_runner.return_value = "duplicate"

    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        client = TestClient(app)
        resp = _stripe_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["outcome"] == "duplicate"


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
@patch("app.modules.billing.api.stripe.Webhook.construct_event")
def test_stripe_handler_exception_returns_500(
    mock_verify,
    mock_runner,
):
    """Processing failures return 500 so Stripe can retry."""
    event = _event(
        "checkout.session.completed",
        {"metadata": {"tenant_id": "t-1"}},
    )
    mock_verify.return_value = event
    mock_runner.side_effect = RuntimeError("DB offline")

    with patch(
        "app.modules.billing.api.settings.STRIPE_WEBHOOK_SECRET",
        STRIPE_SECRET,
    ):
        client = TestClient(app)
        resp = _stripe_post(client, event)

    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "webhook_processing_failed"


# ---------------------------------------------------------------------------
# Paystack signature verification
# ---------------------------------------------------------------------------


def test_paystack_valid_signature_is_accepted():
    """A valid Paystack HMAC signature allows event processing."""
    event = _paystack_event("unknown.event", {})

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = _paystack_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["outcome"] == "ignored"


def test_paystack_invalid_signature_returns_400():
    """Invalid Paystack signatures must be rejected."""
    event = _paystack_event("charge.success", {"reference": "ref_123"})

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = client.post(
            PAYSTACK_WEBHOOK_URL,
            content=json.dumps(event).encode(),
            headers={"x-paystack-signature": "invalid-signature"},
        )

    assert resp.status_code == 400


def test_paystack_missing_signature_returns_400():
    """A missing Paystack signature must be rejected."""
    event = _paystack_event("charge.success", {"reference": "ref_123"})

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = client.post(
            PAYSTACK_WEBHOOK_URL,
            content=json.dumps(event).encode(),
        )

    assert resp.status_code == 400


def test_paystack_missing_secret_returns_503():
    """Paystack webhook endpoint without a configured secret returns 503."""
    with patch("app.modules.billing.api.settings.PAYSTACK_SECRET_KEY", ""):
        client = TestClient(app)
        resp = client.post(
            PAYSTACK_WEBHOOK_URL,
            content=b"{}",
        )

    assert resp.status_code == 503


def test_paystack_invalid_payload_returns_400():
    """Malformed Paystack JSON must be rejected after signature verification."""
    payload = b"not-json"
    signature = hmac.new(
        PAYSTACK_SECRET.encode(),
        payload,
        hashlib.sha512,
    ).hexdigest()

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = client.post(
            PAYSTACK_WEBHOOK_URL,
            content=payload,
            headers={"x-paystack-signature": signature},
        )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Paystack event dispatch
# ---------------------------------------------------------------------------


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
def test_paystack_charge_success_dispatches(mock_runner):
    """charge.success is dispatched to the webhook runner."""
    event = _paystack_event(
        "charge.success",
        {"reference": "ref_123"},
    )
    mock_runner.return_value = "processed"

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = _paystack_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["received"] is True
    assert resp.json()["data"]["outcome"] == "processed"
    mock_runner.assert_called_once()

    args = mock_runner.call_args.args
    assert args[0] == "paystack"
    assert args[2] == "charge.success"


def test_paystack_unknown_event_type_ignored():
    """Unrecognised Paystack events are acknowledged without processing."""
    event = _paystack_event("unknown.event", {})

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = _paystack_post(client, event)

    assert resp.status_code == 200
    assert resp.json()["data"]["outcome"] == "ignored"


@patch("app.modules.billing.api.webhook_runner.run_idempotent")
def test_paystack_processing_failure_returns_500(mock_runner):
    """Paystack processing failures return 500 so Paystack can retry."""
    event = _paystack_event(
        "charge.success",
        {"reference": "ref_123"},
    )
    mock_runner.side_effect = RuntimeError("DB offline")

    with patch(
        "app.modules.billing.api.settings.PAYSTACK_SECRET_KEY",
        PAYSTACK_SECRET,
    ):
        client = TestClient(app)
        resp = _paystack_post(client, event)

    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "webhook_processing_failed"


# ---------------------------------------------------------------------------
# Stripe handler unit tests
# ---------------------------------------------------------------------------


def test_checkout_completed_queues_subscription_activation():
    """Paid checkout activates the subscription and stores provider IDs."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_checkout_session_completed

    db, batch, ref = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": SubscriptionStatus.TRIAL.value,
        }
    )

    event = _event(
        "checkout.session.completed",
        {
            "customer": "cus_123",
            "subscription": "sub_abc",
            "payment_status": "paid",
            "metadata": {
                "tenant_id": "t-1",
                "plan_id": "professional",
            },
        },
    )

    handle_checkout_session_completed(db, batch, event)

    batch.update.assert_called_once()
    update_data = batch.update.call_args.args[1]

    assert batch.update.call_args.args[0] == ref
    assert update_data["status"] == SubscriptionStatus.ACTIVE.value
    assert update_data["stripe_subscription_id"] == "sub_abc"
    assert update_data["stripe_customer_id"] == "cus_123"
    assert update_data["plan_id"] == "professional"


def test_checkout_completed_ignores_unpaid_session():
    """Unpaid checkout sessions must not activate a subscription."""
    from app.modules.billing.webhooks import handle_checkout_session_completed

    db, batch, _ = _subscription_db(
        {"tenant_id": "t-1", "status": "trial"}
    )

    event = _event(
        "checkout.session.completed",
        {
            "payment_status": "unpaid",
            "metadata": {
                "tenant_id": "t-1",
                "plan_id": "professional",
            },
        },
    )

    handle_checkout_session_completed(db, batch, event)

    batch.update.assert_not_called()


def test_payment_failed_sets_past_due_and_grace_period():
    """invoice.payment_failed sets PAST_DUE and starts the grace period."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_invoice_payment_failed

    db, batch, ref = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": SubscriptionStatus.ACTIVE.value,
        }
    )

    event = _event(
        "invoice.payment_failed",
        {"customer": "cus_123"},
    )

    handle_invoice_payment_failed(db, batch, event)

    batch.update.assert_called_once()
    update_data = batch.update.call_args.args[1]

    assert batch.update.call_args.args[0] == ref
    assert update_data["status"] == SubscriptionStatus.PAST_DUE.value
    assert "grace_period_end" in update_data
    assert update_data["grace_period_end"] is not None


def test_payment_failed_does_not_reset_existing_grace_period():
    """Repeated failed payments must not extend the original grace period."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_invoice_payment_failed

    existing_grace_end = datetime(2026, 11, 10, tzinfo=UTC)

    db, batch, _ = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": SubscriptionStatus.PAST_DUE.value,
            "grace_period_end": existing_grace_end,
        }
    )

    event = _event(
        "invoice.payment_failed",
        {"customer": "cus_123"},
    )

    handle_invoice_payment_failed(db, batch, event)

    update_data = batch.update.call_args.args[1]
    assert "grace_period_end" not in update_data


def test_subscription_deleted_sets_cancelled():
    """customer.subscription.deleted sets subscription status to CANCELLED."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_subscription_deleted

    db, batch, ref = _subscription_db(
        {"tenant_id": "t-1", "status": SubscriptionStatus.ACTIVE.value}
    )

    event = _event(
        "customer.subscription.deleted",
        {"customer": "cus_123"},
    )

    handle_subscription_deleted(db, batch, event)

    batch.update.assert_called_once()
    update_data = batch.update.call_args.args[1]

    assert batch.update.call_args.args[0] == ref
    assert update_data["status"] == SubscriptionStatus.CANCELLED.value


def test_stale_stripe_event_does_not_overwrite_newer_subscription_state():
    """Older provider events must not overwrite newer subscription state."""
    from app.modules.billing.webhooks import handle_subscription_deleted

    newer_event_time = datetime(2026, 11, 3, tzinfo=UTC)

    db, batch, _ = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": "active",
            "last_event_at": newer_event_time,
        }
    )

    old_event = {
        "id": "evt_old",
        "type": "customer.subscription.deleted",
        "created": 1_700_000_000,
        "data": {"object": {"customer": "cus_123"}},
    }

    handle_subscription_deleted(db, batch, old_event)

    batch.update.assert_not_called()


def test_invoice_payment_succeeded_records_invoice_and_renews_period():
    """Successful Stripe invoice records an invoice and renews the period."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.webhooks import handle_invoice_payment_succeeded

    db, batch, ref = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": SubscriptionStatus.PAST_DUE.value,
        }
    )

    event = _event(
        "invoice.payment_succeeded",
        {
            "id": "in_123",
            "customer": "cus_123",
            "amount_paid": 5000,
            "currency": "USD",
            "description": "Professional plan",
            "lines": {
                "data": [
                    {"period": {"end": 1_800_000_000}},
                ]
            },
        },
    )

    handle_invoice_payment_succeeded(db, batch, event)

    batch.update.assert_called_once()
    update_data = batch.update.call_args.args[1]

    assert batch.update.call_args.args[0] == ref
    assert update_data["status"] == SubscriptionStatus.ACTIVE.value
    assert update_data["grace_period_end"] is None
    assert update_data["current_period_end"] is not None

    batch.set.assert_called_once()
    invoice_data = batch.set.call_args.args[1]

    assert invoice_data["id"] == "in_123"
    assert invoice_data["tenant_id"] == "t-1"
    assert invoice_data["provider"] == "stripe"
    assert invoice_data["amount_cents"] == 5000
    assert invoice_data["status"] == "paid"


# ---------------------------------------------------------------------------
# Paystack handler unit tests
# ---------------------------------------------------------------------------


@patch("app.modules.billing.paystack_webhooks.verify_transaction")
def test_paystack_charge_success_activates_subscription(mock_verify):
    """Verified Paystack charge activates the subscription."""
    from app.modules.billing.schemas import SubscriptionStatus
    from app.modules.billing.paystack_webhooks import handle_charge_success

    db, batch, ref = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": SubscriptionStatus.TRIAL.value,
            "plan_id": "professional",
        }
    )

    mock_verify.return_value = {
        "status": "success",
        "reference": "ref_123",
        "amount": 500000,
        "currency": "NGN",
        "paid_at": "2026-11-01T10:00:00Z",
        "metadata": {
            "tenant_id": "t-1",
            "plan_id": "professional",
        },
        "plan_object": {
            "plan_code": "professional_code",
        },
        "customer": {
            "customer_code": "CUS_123",
        },
    }

    event = _paystack_event(
        "charge.success",
        {"reference": "ref_123"},
    )

    with patch(
        "app.modules.billing.paystack_webhooks.settings.PAYSTACK_PLAN_PROFESSIONAL",
        "professional_code",
    ):
        with patch(
            "app.modules.billing.paystack_webhooks.settings.PAYSTACK_AMOUNT_PROFESSIONAL",
            500000,
        ):
            handle_charge_success(db, batch, event)

    mock_verify.assert_called_once_with("ref_123")
    batch.update.assert_called_once()

    update_data = batch.update.call_args.args[1]
    assert batch.update.call_args.args[0] == ref
    assert update_data["status"] == SubscriptionStatus.ACTIVE.value
    assert update_data["provider"] == "paystack"
    assert update_data["plan_id"] == "professional"
    assert update_data["paystack_customer_code"] == "CUS_123"

    batch.set.assert_called_once()
    invoice_data = batch.set.call_args.args[1]
    assert invoice_data["id"] == "ref_123"
    assert invoice_data["provider"] == "paystack"
    assert invoice_data["status"] == "paid"


@patch("app.modules.billing.paystack_webhooks.verify_transaction")
def test_paystack_charge_success_ignores_unverified_payment(mock_verify):
    """A Paystack transaction not confirmed as successful is ignored."""
    from app.modules.billing.paystack_webhooks import handle_charge_success

    db, batch, _ = _subscription_db(
        {"tenant_id": "t-1", "status": "trial"}
    )

    mock_verify.return_value = {
        "status": "failed",
        "reference": "ref_123",
    }

    event = _paystack_event(
        "charge.success",
        {"reference": "ref_123"},
    )

    handle_charge_success(db, batch, event)

    batch.update.assert_not_called()
    batch.set.assert_not_called()


@patch("app.modules.billing.paystack_webhooks.verify_transaction")
def test_paystack_charge_success_rejects_wrong_amount(mock_verify):
    """A verified transaction with an incorrect amount must not activate."""
    from app.modules.billing.paystack_webhooks import handle_charge_success

    db, batch, _ = _subscription_db(
        {
            "tenant_id": "t-1",
            "status": "trial",
            "plan_id": "professional",
        }
    )

    mock_verify.return_value = {
        "status": "success",
        "reference": "ref_123",
        "amount": 1000,
        "currency": "NGN",
        "paid_at": "2026-11-01T10:00:00Z",
        "metadata": {
            "tenant_id": "t-1",
            "plan_id": "professional",
        },
        "customer": {
            "customer_code": "CUS_123",
        },
    }

    with patch(
        "app.modules.billing.paystack_webhooks.settings.PAYSTACK_AMOUNT_PROFESSIONAL",
        500000,
    ):
        handle_charge_success(
            db,
            batch,
            _paystack_event(
                "charge.success",
                {"reference": "ref_123"},
            ),
        )

    batch.update.assert_not_called()
    batch.set.assert_not_called()


# ---------------------------------------------------------------------------
# Paystack helper tests
# ---------------------------------------------------------------------------


def test_paystack_signature_verification():
    """Paystack signature helper validates the raw request body."""
    from app.modules.billing.paystack_webhooks import verify_signature

    payload = b'{"event":"charge.success"}'
    signature = hmac.new(
        PAYSTACK_SECRET.encode(),
        payload,
        hashlib.sha512,
    ).hexdigest()

    assert verify_signature(payload, signature, PAYSTACK_SECRET) is True
    assert verify_signature(payload, "wrong-signature", PAYSTACK_SECRET) is False
    assert verify_signature(payload, None, PAYSTACK_SECRET) is False
    assert verify_signature(payload, signature, "") is False


def test_paystack_event_key_is_deterministic():
    """Identical Paystack deliveries produce the same idempotency key."""
    from app.modules.billing.paystack_webhooks import event_key

    payload = b'{"event":"charge.success","data":{"reference":"ref_123"}}'

    first = event_key("charge.success", payload)
    second = event_key("charge.success", payload)

    assert first == second
    assert first.startswith("charge.success__")


def test_paystack_add_month_handles_month_end():
    """Paystack billing periods use calendar months and clamp month-end dates."""
    from app.modules.billing.paystack_webhooks import _add_month

    january_31 = datetime(2026, 1, 31, 10, 0, tzinfo=UTC)
    result = _add_month(january_31)

    assert result == datetime(2026, 2, 28, 10, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Webhook runner tests
# ---------------------------------------------------------------------------


@patch("app.modules.billing.webhook_runner.get_db")
def test_webhook_runner_commits_handler_and_processed_marker_atomically(
    mock_get_db,
):
    """The runner commits queued handler writes and event marker in one batch."""
    from app.modules.billing.webhook_runner import run_idempotent

    db = MagicMock()
    batch = MagicMock()
    mock_get_db.return_value = db
    db.batch.return_value = batch

    event_ref = MagicMock()
    db.collection.return_value.document.return_value = event_ref

    event_ref.create.return_value = None

    apply = MagicMock()

    outcome = run_idempotent(
        "stripe",
        "evt_123",
        "checkout.session.completed",
        apply,
    )

    assert outcome == "processed"
    apply.assert_called_once_with(db, batch)
    batch.update.assert_called_once()
    batch.commit.assert_called_once()


@patch("app.modules.billing.webhook_runner.get_db")
def test_webhook_runner_returns_duplicate_without_reprocessing(mock_get_db):
    """Previously processed events must not execute their handler again."""
    from google.api_core.exceptions import AlreadyExists

    from app.modules.billing.webhook_runner import run_idempotent

    db = MagicMock()
    mock_get_db.return_value = db

    event_ref = MagicMock()
    db.collection.return_value.document.return_value = event_ref

    event_ref.create.side_effect = AlreadyExists("already exists")
    event_ref.get.return_value.to_dict.return_value = {
        "status": "processed",
        "attempts": 1,
    }

    apply = MagicMock()

    outcome = run_idempotent(
        "stripe",
        "evt_123",
        "checkout.session.completed",
        apply,
    )

    assert outcome == "duplicate"
    apply.assert_not_called()


@patch("app.modules.billing.webhook_runner.get_db")
def test_webhook_runner_rejects_event_with_active_processing_lock(mock_get_db):
    """A fresh processing lock prevents concurrent duplicate execution."""
    from google.api_core.exceptions import AlreadyExists

    from app.modules.billing.webhook_runner import (
        ClaimResult,
        claim_event,
    )

    db = MagicMock()
    mock_get_db.return_value = db

    event_ref = MagicMock()
    db.collection.return_value.document.return_value = event_ref

    event_ref.create.side_effect = AlreadyExists("already exists")
    event_ref.get.return_value.to_dict.return_value = {
        "status": "processing",
        "lock_until": datetime(2099, 1, 1, tzinfo=UTC),
        "attempts": 1,
    }

    result = claim_event(db, "stripe", "evt_123", "checkout.session.completed")

    assert result == ClaimResult.BUSY


@patch("app.modules.billing.webhook_runner.get_db")
def test_webhook_runner_marks_failed_event_and_reraises(mock_get_db):
    """Failed handler execution is recorded and propagated for provider retry."""
    from app.modules.billing.webhook_runner import run_idempotent

    db = MagicMock()
    batch = MagicMock()
    mock_get_db.return_value = db
    db.batch.return_value = batch

    event_ref = MagicMock()
    db.collection.return_value.document.return_value = event_ref

    event_ref.create.return_value = None

    apply = MagicMock(side_effect=RuntimeError("Firestore unavailable"))

    try:
        run_idempotent(
            "stripe",
            "evt_123",
            "checkout.session.completed",
            apply,
        )
    except RuntimeError as exc:
        assert str(exc) == "Firestore unavailable"
    else:
        raise AssertionError("Expected RuntimeError to be raised")

    event_ref.update.assert_called_once()
    failure_data = event_ref.update.call_args.args[0]

    assert failure_data["status"] == "failed"
    assert failure_data["error"] == "RuntimeError"