"""Tests for the billing service and the routes that sit on it."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.responses import AppError
from app.main import app
from app.modules.billing import service
from app.modules.billing.schemas import (
    AccessLevel,
    CheckoutRequest,
    PaymentProvider,
    SubscriptionStatus,
)
from app.shared.auth import get_current_user
from tests.fake_firestore import subscription_doc

SUB = "subscriptions/t-1"
S = SubscriptionStatus


def subs_for(fake_db, tenant_id="t-1"):
    return [
        k
        for k, v in fake_db.store.items()
        if k.startswith("subscriptions/") and v.get("tenant_id") == tenant_id
    ]


# ---------------------------------------------------------------------------
# Trial creation
# ---------------------------------------------------------------------------


def test_trial_is_created_once_per_tenant(fake_db):
    service.create_trial_subscription("t-1", "owner@acme.com")
    service.create_trial_subscription("t-1", "owner@acme.com")  # duplicate event

    assert subs_for(fake_db) == [SUB]
    trial = fake_db.doc(SUB)
    assert trial["status"] == S.TRIAL.value
    assert trial["admin_email"] == "owner@acme.com"
    assert trial["trial_end"] > datetime.now(UTC)


def test_trial_is_not_duplicated_over_a_legacy_record(fake_db):
    """Older records used a random document id; they still count."""
    fake_db.put("subscriptions/legacy-uuid", subscription_doc("t-1"))
    service.create_trial_subscription("t-1", "owner@acme.com")
    assert subs_for(fake_db) == ["subscriptions/legacy-uuid"]


def test_trial_creation_failure_does_not_raise(fake_db):
    with patch.object(service, "_create_trial", side_effect=RuntimeError("down")):
        service.create_trial_subscription("t-1", "owner@acme.com")  # must not raise


# ---------------------------------------------------------------------------
# get_subscription
# ---------------------------------------------------------------------------


def test_missing_subscription_is_404_by_default(fake_db):
    with pytest.raises(AppError) as exc:
        service.get_subscription("t-1")
    assert exc.value.status_code == 404
    assert subs_for(fake_db) == []


def test_missing_subscription_gets_a_trial_for_a_tenant_member(fake_db):
    result = service.get_subscription("t-1", create_if_missing=True)
    assert result.status == S.TRIAL
    assert result.access_level == AccessLevel.FULL
    assert subs_for(fake_db) == [SUB]


def test_expired_trial_is_reported_as_expired_and_read_only(fake_db):
    fake_db.put(
        SUB, subscription_doc("t-1", trial_end=datetime.now(UTC) - timedelta(days=1))
    )
    result = service.get_subscription("t-1")
    assert result.status == S.EXPIRED
    assert result.access_level == AccessLevel.READ_ONLY


def test_subscription_reports_real_usage(fake_db):
    fake_db.put(SUB, subscription_doc("t-1"))
    fake_db.put("tenants/t-1/members/u1", {})
    fake_db.put("tenants/t-1/members/u2", {})
    from app.modules.billing import ports

    fake_db.put(
        "usage_counters/t-1",
        {ports._month_field("monthly_messages"): 7},
    )
    usage = service.get_subscription("t-1").usage
    assert usage.users == 2
    assert usage.monthly_messages_this_month == 7


# ---------------------------------------------------------------------------
# Checkout guards
# ---------------------------------------------------------------------------


@pytest.fixture
def stripe_cfg():
    with (
        patch.object(settings, "STRIPE_SECRET_KEY", "sk_test"),
        patch.object(settings, "STRIPE_PRICE_PROFESSIONAL", "price_pro"),
    ):
        yield


@pytest.fixture
def paystack_cfg():
    with (
        patch.object(settings, "PAYSTACK_SECRET_KEY", "sk_test"),
        patch.object(settings, "PAYSTACK_PLAN_PROFESSIONAL", "PLN_pro"),
        patch.object(settings, "PAYSTACK_AMOUNT_PROFESSIONAL", 0),
    ):
        yield


def pro_request(provider):
    return CheckoutRequest(plan_id="professional", provider=provider)


def paystack_ok():
    response = MagicMock(is_success=True)
    response.json.return_value = {
        "status": True,
        "data": {"authorization_url": "https://paystack.test/pay"},
    }
    return response


def test_stripe_checkout_refused_while_paid_subscription_is_active(
    fake_db, stripe_cfg
):
    """A second checkout would double-bill the tenant."""
    fake_db.put(
        SUB,
        subscription_doc("t-1", status=S.ACTIVE.value, provider="stripe"),
    )
    with pytest.raises(AppError) as exc:
        service.create_stripe_checkout("t-1", pro_request(PaymentProvider.STRIPE))
    assert exc.value.status_code == 409
    assert exc.value.code == "subscription_already_active"


def test_paystack_checkout_refused_while_paid_subscription_is_active(
    fake_db, paystack_cfg
):
    fake_db.put(
        SUB,
        subscription_doc("t-1", status=S.ACTIVE.value, provider="paystack"),
    )
    with pytest.raises(AppError) as exc:
        service.create_paystack_checkout(
            "t-1", pro_request(PaymentProvider.PAYSTACK), "owner@acme.com"
        )
    assert exc.value.code == "subscription_already_active"


def test_paystack_checkout_provisions_trial_and_uses_owner_email(
    fake_db, paystack_cfg
):
    with patch.object(service.httpx, "post", return_value=paystack_ok()) as post:
        result = service.create_paystack_checkout(
            "t-1", pro_request(PaymentProvider.PAYSTACK), "owner@acme.com"
        )

    assert result.checkout_url == "https://paystack.test/pay"
    assert subs_for(fake_db) == [SUB]
    body = post.call_args.kwargs["json"]
    assert body["email"] == "owner@acme.com"
    assert body["plan"] == "PLN_pro"
    assert body["metadata"] == {"tenant_id": "t-1", "plan_id": "professional"}
    assert "amount" not in body  # not configured


def test_paystack_checkout_sends_amount_when_configured(fake_db, paystack_cfg):
    fake_db.put(SUB, subscription_doc("t-1"))
    with (
        patch.object(settings, "PAYSTACK_AMOUNT_PROFESSIONAL", 500000),
        patch.object(service.httpx, "post", return_value=paystack_ok()) as post,
    ):
        service.create_paystack_checkout(
            "t-1", pro_request(PaymentProvider.PAYSTACK), "owner@acme.com"
        )
    assert post.call_args.kwargs["json"]["amount"] == 500000


def test_paystack_checkout_falls_back_to_stored_email(fake_db, paystack_cfg):
    fake_db.put(SUB, subscription_doc("t-1", admin_email="stored@acme.com"))
    with patch.object(service.httpx, "post", return_value=paystack_ok()) as post:
        service.create_paystack_checkout(
            "t-1", pro_request(PaymentProvider.PAYSTACK), None
        )
    assert post.call_args.kwargs["json"]["email"] == "stored@acme.com"


def test_paystack_checkout_without_any_email_fails(fake_db, paystack_cfg):
    fake_db.put(SUB, subscription_doc("t-1"))
    with pytest.raises(AppError) as exc:
        service.create_paystack_checkout(
            "t-1", pro_request(PaymentProvider.PAYSTACK), None
        )
    assert exc.value.code == "tenant_email_missing"


# ---------------------------------------------------------------------------
# Invoice history
# ---------------------------------------------------------------------------


def seed_invoices(fake_db, count=3, tenant_id="t-1"):
    base = datetime(2026, 11, 1, tzinfo=UTC)
    for i in range(count):
        fake_db.put(
            f"billing_invoices/{tenant_id}/items/stripe__in_{i}",
            {
                "id": f"in_{i}",
                "tenant_id": tenant_id,
                "provider": "stripe",
                "amount_cents": 1000 + i,
                "currency": "usd",
                "status": "paid",
                "date": base + timedelta(days=i),
                "description": None,
                "pdf_url": None,
            },
        )


def test_invoices_are_newest_first_and_paginated(fake_db):
    seed_invoices(fake_db, count=3)

    page1 = service.list_invoices("t-1", limit=2)
    assert [i.id for i in page1.invoices] == ["in_2", "in_1"]
    assert page1.next_cursor == "stripe__in_1"

    page2 = service.list_invoices("t-1", limit=2, cursor=page1.next_cursor)
    assert [i.id for i in page2.invoices] == ["in_0"]
    assert page2.next_cursor is None


def test_invoice_pagination_does_not_skip_invoices_with_equal_timestamps(fake_db):
    same_moment = datetime(2026, 11, 1, tzinfo=UTC)
    for n in ("a", "b", "c"):
        fake_db.put(
            f"billing_invoices/t-1/items/stripe__in_{n}",
            {
                "id": f"in_{n}", "tenant_id": "t-1", "provider": "stripe",
                "amount_cents": 1, "currency": "usd", "status": "paid",
                "date": same_moment, "description": None, "pdf_url": None,
            },
        )
    seen, cursor = [], None
    for _ in range(5):  # one invoice per page
        page = service.list_invoices("t-1", limit=1, cursor=cursor)
        seen += [i.id for i in page.invoices]
        cursor = page.next_cursor
        if cursor is None:
            break
    assert sorted(seen) == ["in_a", "in_b", "in_c"]


def test_invoices_empty_for_tenant_with_none(fake_db):
    result = service.list_invoices("t-1")
    assert result.invoices == []
    assert result.next_cursor is None


def test_invoices_never_include_another_tenants_records(fake_db):
    seed_invoices(fake_db, count=2, tenant_id="t-2")
    assert service.list_invoices("t-1").invoices == []


def test_invoice_with_unknown_cursor_is_400(fake_db):
    with pytest.raises(AppError) as exc:
        service.list_invoices("t-1", cursor="not-an-invoice")
    assert exc.value.status_code == 400


def test_invoice_cursor_cannot_point_into_another_tenant(fake_db):
    seed_invoices(fake_db, count=1, tenant_id="t-2")
    with pytest.raises(AppError) as exc:
        service.list_invoices("t-1", cursor="stripe__in_0")  # exists only in t-2
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Routes: who may call what
# ---------------------------------------------------------------------------

OWNER = {"uid": "u1", "email": "owner@acme.com", "role": "company_owner", "tenant_id": "t-1"}
ADMIN = {**OWNER, "uid": "u2", "role": "company_admin"}
PLATFORM = {"uid": "u3", "email": "ops@margo.io", "role": "platform_admin"}


def client_as(claims):
    app.dependency_overrides[get_current_user] = lambda: claims
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_owner_can_list_invoices(fake_db):
    seed_invoices(fake_db, count=1)
    resp = client_as(OWNER).get("/api/v1/billing/t-1/invoices")
    assert resp.status_code == 200
    assert resp.json()["data"]["invoices"][0]["id"] == "in_0"


def test_admin_cannot_list_invoices(fake_db):
    resp = client_as(ADMIN).get("/api/v1/billing/t-1/invoices")
    assert resp.status_code == 403


def test_owner_of_another_tenant_cannot_list_invoices(fake_db):
    other = {**OWNER, "tenant_id": "t-2"}
    resp = client_as(other).get("/api/v1/billing/t-1/invoices")
    assert resp.status_code == 403


def test_stripe_webhook_without_signature_header_is_400(fake_db):
    with patch.object(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test"):
        resp = TestClient(app).post("/api/v1/billing/webhook/stripe", content=b"{}")
    assert resp.status_code == 400


def test_platform_admin_never_creates_a_subscription(fake_db):
    """Probing an arbitrary tenant id must not create billing records."""
    resp = client_as(PLATFORM).get("/api/v1/billing/ghost-tenant/subscription")
    assert resp.status_code == 404
    assert subs_for(fake_db, "ghost-tenant") == []


def test_owner_reading_subscription_provisions_missing_trial(fake_db):
    resp = client_as(OWNER).get("/api/v1/billing/t-1/subscription")
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == S.TRIAL.value
    assert resp.json()["data"]["access_level"] == "full"