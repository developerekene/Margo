"""Stripe webhook event handlers.

Handles the Stripe events that drive subscription lifecycle transitions:
  checkout.session.completed  → ACTIVE (first payment)
  invoice.payment_succeeded   → ACTIVE / renew current_period_end
  invoice.payment_failed      → PAST_DUE + grace_period_end
  customer.subscription.deleted → CANCELLED

Security: every handler is called ONLY after signature verification in the
API layer. These functions trust their input — do not call them directly
without prior signature verification.
"""

import logging
from datetime import UTC, datetime, timedelta

from app.modules.billing.plans import PAST_DUE_GRACE_DAYS
from app.modules.billing.schemas import SubscriptionStatus
from app.shared.container import get_db

logger = logging.getLogger("margo")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _find_subscription_by_stripe_customer(db, stripe_customer_id: str):
    """Return (doc_ref, doc_data) for the subscription with this customer ID."""
    docs = (
        db.collection("subscriptions")
        .where("stripe_customer_id", "==", stripe_customer_id)
        .limit(1)
        .get()
    )
    if not docs:
        return None, None
    return docs[0].reference, docs[0].to_dict()


def _find_subscription_by_tenant(db, tenant_id: str):
    """Return (doc_ref, doc_data) for the subscription belonging to tenant_id."""
    docs = (
        db.collection("subscriptions")
        .where("tenant_id", "==", tenant_id)
        .limit(1)
        .get()
    )
    if not docs:
        return None, None
    return docs[0].reference, docs[0].to_dict()


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


def handle_checkout_session_completed(event: dict) -> None:
    """checkout.session.completed — first payment succeeded.

    Transitions the subscription from TRIAL (or any pending state) to ACTIVE.
    Stores the Stripe subscription ID and the billing period end date.
    """
    session = event.get("data", {}).get("object", {})
    metadata = session.get("metadata", {})
    tenant_id = metadata.get("tenant_id")
    plan_id = metadata.get("plan_id")
    stripe_subscription_id = session.get("subscription")
    stripe_customer_id = session.get("customer")

    if not tenant_id:
        logger.warning("checkout.session.completed missing tenant_id in metadata")
        return

    db = get_db()

    # Prefer looking up by tenant_id from metadata — most reliable.
    ref, data = _find_subscription_by_tenant(db, tenant_id)
    if ref is None:
        logger.error(
            "checkout.session.completed: no subscription for tenant=%s", tenant_id
        )
        return

    now = datetime.now(UTC)
    update = {
        "status": SubscriptionStatus.ACTIVE.value,
        "provider": "stripe",
        "stripe_subscription_id": stripe_subscription_id,
        "stripe_customer_id": stripe_customer_id,
        "updated_at": now,
    }
    if plan_id:
        update["plan_id"] = plan_id

    ref.update(update)

    logger.info(
        "Subscription activated via Stripe checkout: tenant=%s plan=%s "
        "stripe_sub=%s",
        tenant_id,
        plan_id,
        stripe_subscription_id,
    )


def handle_invoice_payment_succeeded(event: dict) -> None:
    """invoice.payment_succeeded — recurring payment collected.

    Renews current_period_end and clears PAST_DUE if the tenant was behind.
    """
    invoice = event.get("data", {}).get("object", {})
    stripe_customer_id = invoice.get("customer")
    # period_end is a Unix timestamp from Stripe
    period_end_ts = invoice.get("lines", {}).get("data", [{}])[0].get(
        "period", {}
    ).get("end")

    if not stripe_customer_id:
        logger.warning("invoice.payment_succeeded missing customer field")
        return

    db = get_db()
    ref, data = _find_subscription_by_stripe_customer(db, stripe_customer_id)
    if ref is None:
        logger.warning(
            "invoice.payment_succeeded: no subscription for customer=%s",
            stripe_customer_id,
        )
        return

    now = datetime.now(UTC)
    update: dict = {
        "status": SubscriptionStatus.ACTIVE.value,
        "grace_period_end": None,
        "updated_at": now,
    }

    if period_end_ts:
        update["current_period_end"] = datetime.fromtimestamp(period_end_ts, tz=UTC)

    ref.update(update)

    logger.info(
        "Invoice payment succeeded: customer=%s new_period_end=%s",
        stripe_customer_id,
        update.get("current_period_end"),
    )


def handle_invoice_payment_failed(event: dict) -> None:
    """invoice.payment_failed — payment attempt failed.

    Transitions to PAST_DUE and sets grace_period_end so is_subscription_active
    can enforce the grace window without a secondary Stripe API call.
    """
    invoice = event.get("data", {}).get("object", {})
    stripe_customer_id = invoice.get("customer")

    if not stripe_customer_id:
        logger.warning("invoice.payment_failed missing customer field")
        return

    db = get_db()
    ref, data = _find_subscription_by_stripe_customer(db, stripe_customer_id)
    if ref is None:
        logger.warning(
            "invoice.payment_failed: no subscription for customer=%s",
            stripe_customer_id,
        )
        return

    now = datetime.now(UTC)
    grace_period_end = now + timedelta(days=PAST_DUE_GRACE_DAYS)

    ref.update(
        {
            "status": SubscriptionStatus.PAST_DUE.value,
            "grace_period_end": grace_period_end,
            "updated_at": now,
        }
    )

    logger.warning(
        "Invoice payment failed: customer=%s grace_period_end=%s",
        stripe_customer_id,
        grace_period_end.isoformat(),
    )


def handle_subscription_deleted(event: dict) -> None:
    """customer.subscription.deleted — subscription cancelled in Stripe.

    Marks the subscription as CANCELLED. The tenant loses access immediately
    since CANCELLED is not in STATUSES_WITH_ACCESS.
    """
    subscription = event.get("data", {}).get("object", {})
    stripe_customer_id = subscription.get("customer")

    if not stripe_customer_id:
        logger.warning("customer.subscription.deleted missing customer field")
        return

    db = get_db()
    ref, data = _find_subscription_by_stripe_customer(db, stripe_customer_id)
    if ref is None:
        logger.warning(
            "customer.subscription.deleted: no subscription for customer=%s",
            stripe_customer_id,
        )
        return

    ref.update(
        {
            "status": SubscriptionStatus.CANCELLED.value,
            "updated_at": datetime.now(UTC),
        }
    )

    logger.info(
        "Subscription cancelled via Stripe: customer=%s tenant=%s",
        stripe_customer_id,
        data.get("tenant_id"),
    )
