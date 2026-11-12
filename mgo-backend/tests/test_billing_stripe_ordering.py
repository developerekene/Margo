"""Stripe delivers events in no guaranteed order; plan assignment must survive."""

import json
import logging
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.modules.billing.schemas import SubscriptionStatus
from tests.fake_firestore import subscription_doc

URL = "/api/v1/billing/webhook/stripe"
T0 = int(datetime(2026, 11, 4, 10, 0, tzinfo=UTC).timestamp())
SUB = "subscriptions/t-1"


@pytest.fixture(autouse=True)
def _secret():
    with patch.object(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test"):
        yield


def post(event):
    with patch(
        "app.modules.billing.api.stripe.Webhook.construct_event", return_value=event
    ):
        return TestClient(app).post(
            URL, content=json.dumps(event), headers={"stripe-signature": "t=1,v1=x"}
        )


def checkout_event(event_id, created, sub_id="sub_1"):
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "created": created,
        "data": {
            "object": {
                "metadata": {"tenant_id": "t-1", "plan_id": "professional"},
                "payment_status": "paid",
                "subscription": sub_id,
                "customer": "cus_1",
            }
        },
    }


def invoice_paid_event(event_id, created):
    return {
        "id": event_id,
        "type": "invoice.payment_succeeded",
        "created": created,
        "data": {
            "object": {
                "id": "in_1",
                "customer": "cus_1",
                "amount_paid": 2000,
                "currency": "usd",
                "lines": {"data": [{"period": {"end": T0 + 30 * 86400}}]},
            }
        },
    }


def test_checkout_completed_after_a_later_stamped_invoice_still_sets_the_plan(fake_db):
    """invoice.payment_succeeded can carry a later timestamp but arrive first."""
    fake_db.put(SUB, subscription_doc("t-1", stripe_customer_id="cus_1"))

    post(invoice_paid_event("evt_inv", created=T0 + 5))   # arrives first, newer
    post(checkout_event("evt_chk", created=T0))           # arrives second, older

    sub = fake_db.doc(SUB)
    assert sub["status"] == SubscriptionStatus.ACTIVE.value
    assert sub["plan_id"] == "professional"
    assert sub["provider"] == "stripe"
    assert sub["stripe_subscription_id"] == "sub_1"


def test_checkout_completed_in_normal_order_still_works(fake_db):
    fake_db.put(SUB, subscription_doc("t-1", stripe_customer_id="cus_1"))
    post(checkout_event("evt_chk", created=T0))
    post(invoice_paid_event("evt_inv", created=T0 + 5))
    sub = fake_db.doc(SUB)
    assert sub["status"] == SubscriptionStatus.ACTIVE.value
    assert sub["plan_id"] == "professional"


def test_stale_checkout_does_not_reactivate_a_past_due_subscription(fake_db):
    """Recording the plan must not undo a newer payment failure."""
    fake_db.put(
        SUB,
        subscription_doc(
            "t-1",
            stripe_customer_id="cus_1",
            status=SubscriptionStatus.PAST_DUE.value,
            last_event_at=datetime.fromtimestamp(T0 + 100, tz=UTC),
        ),
    )
    post(checkout_event("evt_chk", created=T0))
    sub = fake_db.doc(SUB)
    assert sub["status"] == SubscriptionStatus.PAST_DUE.value
    assert sub["plan_id"] == "professional"


def test_second_paid_subscription_is_not_adopted_and_is_logged(fake_db, caplog):
    fake_db.put(
        SUB,
        subscription_doc(
            "t-1",
            stripe_customer_id="cus_1",
            status=SubscriptionStatus.ACTIVE.value,
            provider="stripe",
            plan_id="professional",
            stripe_subscription_id="sub_1",
        ),
    )
    with caplog.at_level(logging.ERROR, logger="margo"):
        resp = post(checkout_event("evt_dup", created=T0 + 50, sub_id="sub_2"))

    assert resp.status_code == 200
    assert fake_db.doc(SUB)["stripe_subscription_id"] == "sub_1"
    assert "DUPLICATE PAID SUBSCRIPTION" in caplog.text