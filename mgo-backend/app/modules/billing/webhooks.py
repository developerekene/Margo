"""Stripe webhook event handlers.

Each handler has the signature handler(db, batch, event) and only QUEUES
writes on `batch`; webhook_runner commits them atomically together with the
idempotency marker. Handlers run only after signature verification in the
API layer.

Events handled:
  checkout.session.completed      -> ACTIVE (first payment)
  invoice.payment_succeeded       -> ACTIVE, renew period, record invoice
  invoice.payment_failed          -> PAST_DUE (+ grace, set once)
  customer.subscription.updated   -> sync cancel_at_period_end / period end
  customer.subscription.deleted   -> CANCELLED

Out-of-order protection: status changes carry the provider event time and
are skipped when the subscription already reflects a newer event.
"""

import logging
from datetime import UTC, datetime, timedelta

from app.modules.billing.constants import INVOICES, SUBSCRIPTIONS
from app.modules.billing.plans import PAST_DUE_GRACE_DAYS, PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import SubscriptionStatus

logger = logging.getLogger("margo")


# ---------------------------------------------------------------------------
# Helpers (shared with the Paystack handlers)
# ---------------------------------------------------------------------------


def find_subscription(db, field: str, value: str):
    """Return (doc_ref, data) for the subscription where field == value."""
    docs = db.collection(SUBSCRIPTIONS).where(field, "==", value).limit(1).get()
    if not docs:
        return None, None
    return docs[0].reference, docs[0].to_dict()


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def is_stale(sub: dict, event_time: datetime) -> bool:
    """True if the subscription already reflects a newer provider event."""
    last = sub.get("last_event_at")
    return last is not None and _utc(last) > event_time


def past_due_update(sub: dict, now: datetime) -> dict:
    """Fields to set when a payment fails.

    The grace window starts on the FIRST failure only: providers retry failed
    payments and send an event per attempt, and resetting the window each
    time would keep a non-paying tenant active indefinitely.
    """
    update: dict = {"status": SubscriptionStatus.PAST_DUE.value, "updated_at": now}
    already = (
        sub.get("status") == SubscriptionStatus.PAST_DUE.value
        and sub.get("grace_period_end") is not None
    )
    if not already:
        update["grace_period_end"] = now + timedelta(days=PAST_DUE_GRACE_DAYS)
    return update


def record_invoice(
    db,
    batch,
    tenant_id: str,
    provider: str,
    invoice_id: str,
    amount_cents: int,
    currency: str,
    status: str,
    date: datetime,
    description: str | None = None,
    pdf_url: str | None = None,
) -> None:
    """Queue a normalized invoice record (idempotent: same id overwrites)."""
    ref = (
        db.collection(INVOICES)
        .document(tenant_id)
        .collection("items")
        .document(f"{provider}__{invoice_id}")
    )
    batch.set(
        ref,
        {
            "id": invoice_id,
            "tenant_id": tenant_id,
            "provider": provider,
            "amount_cents": amount_cents,
            "currency": (currency or "").lower(),
            "status": status,
            "date": date,
            "description": description,
            "pdf_url": pdf_url,
        },
    )


def _event_time(event: dict) -> datetime:
    created = event.get("created")
    if created:
        return datetime.fromtimestamp(created, tz=UTC)
    return datetime.now(UTC)


def _obj(event: dict) -> dict:
    return event.get("data", {}).get("object", {})


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


def handle_checkout_session_completed(db, batch, event: dict) -> None:
    """checkout.session.completed - first payment succeeded."""
    session = _obj(event)
    metadata = session.get("metadata") or {}
    tenant_id = metadata.get("tenant_id")
    plan_id = metadata.get("plan_id")

    if not tenant_id:
        logger.warning("checkout.session.completed missing tenant_id in metadata")
        return
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        logger.info("checkout.session.completed not paid yet; ignored")
        return
    if plan_id not in PLANS or plan_id == TRIAL_PLAN_ID:
        logger.error("checkout.session.completed has unknown plan '%s'", plan_id)
        return

    ref, sub = find_subscription(db, "tenant_id", tenant_id)
    if ref is None:
        logger.error("checkout.session.completed: no subscription for %s", tenant_id)
        return

    event_time = _event_time(event)
    if is_stale(sub, event_time):
        logger.info("checkout.session.completed is stale; ignored")
        return

    batch.update(
        ref,
        {
            "status": SubscriptionStatus.ACTIVE.value,
            "provider": "stripe",
            "plan_id": plan_id,
            "stripe_subscription_id": session.get("subscription"),
            "stripe_customer_id": session.get("customer"),
            "grace_period_end": None,
            "last_event_at": event_time,
            "updated_at": datetime.now(UTC),
        },
    )
    logger.info(
        "Subscription activated via Stripe: tenant=%s plan=%s", tenant_id, plan_id
    )


def handle_invoice_payment_succeeded(db, batch, event: dict) -> None:
    """invoice.payment_succeeded - payment collected; renew the period."""
    invoice = _obj(event)
    customer_id = invoice.get("customer")
    if not customer_id:
        logger.warning("invoice.payment_succeeded missing customer field")
        return

    ref, sub = find_subscription(db, "stripe_customer_id", customer_id)
    if ref is None:
        logger.warning("invoice.payment_succeeded: unknown Stripe customer")
        return

    event_time = _event_time(event)
    lines = (invoice.get("lines") or {}).get("data") or [{}]
    period_end_ts = (lines[0].get("period") or {}).get("end")

    # The invoice is always recorded, even if the status change is stale.
    if invoice.get("id"):
        record_invoice(
            db,
            batch,
            tenant_id=sub["tenant_id"],
            provider="stripe",
            invoice_id=invoice["id"],
            amount_cents=invoice.get("amount_paid", 0),
            currency=invoice.get("currency", ""),
            status="paid",
            date=event_time,
            description=invoice.get("description"),
            pdf_url=invoice.get("invoice_pdf") or invoice.get("hosted_invoice_url"),
        )

    if is_stale(sub, event_time):
        logger.info("invoice.payment_succeeded status change is stale; skipped")
        return

    update: dict = {
        "status": SubscriptionStatus.ACTIVE.value,
        "grace_period_end": None,
        "last_event_at": event_time,
        "updated_at": datetime.now(UTC),
    }
    if period_end_ts:
        update["current_period_end"] = datetime.fromtimestamp(period_end_ts, tz=UTC)
    batch.update(ref, update)


def handle_invoice_payment_failed(db, batch, event: dict) -> None:
    """invoice.payment_failed - move to PAST_DUE and start the grace window."""
    invoice = _obj(event)
    customer_id = invoice.get("customer")
    if not customer_id:
        logger.warning("invoice.payment_failed missing customer field")
        return

    ref, sub = find_subscription(db, "stripe_customer_id", customer_id)
    if ref is None:
        logger.warning("invoice.payment_failed: unknown Stripe customer")
        return

    event_time = _event_time(event)
    if is_stale(sub, event_time):
        logger.info("invoice.payment_failed is stale; ignored")
        return

    update = past_due_update(sub, datetime.now(UTC))
    update["last_event_at"] = event_time
    batch.update(ref, update)
    logger.warning("Stripe payment failed: tenant=%s", sub.get("tenant_id"))


def handle_subscription_updated(db, batch, event: dict) -> None:
    """customer.subscription.updated - sync cancellation flag and period end."""
    obj = _obj(event)
    customer_id = obj.get("customer")
    if not customer_id:
        return

    ref, sub = find_subscription(db, "stripe_customer_id", customer_id)
    if ref is None:
        return

    event_time = _event_time(event)
    if is_stale(sub, event_time):
        return

    # Newer Stripe API versions moved current_period_end onto the items.
    period_end_ts = obj.get("current_period_end")
    if not period_end_ts:
        items = (obj.get("items") or {}).get("data") or [{}]
        period_end_ts = items[0].get("current_period_end")

    update: dict = {
        "cancel_at_period_end": bool(obj.get("cancel_at_period_end", False)),
        "last_event_at": event_time,
        "updated_at": datetime.now(UTC),
    }
    if period_end_ts:
        update["current_period_end"] = datetime.fromtimestamp(period_end_ts, tz=UTC)
    batch.update(ref, update)


def handle_subscription_deleted(db, batch, event: dict) -> None:
    """customer.subscription.deleted - subscription ended in Stripe."""
    customer_id = _obj(event).get("customer")
    if not customer_id:
        logger.warning("customer.subscription.deleted missing customer field")
        return

    ref, sub = find_subscription(db, "stripe_customer_id", customer_id)
    if ref is None:
        logger.warning("customer.subscription.deleted: unknown Stripe customer")
        return

    event_time = _event_time(event)
    if is_stale(sub, event_time):
        logger.info("customer.subscription.deleted is stale; ignored")
        return

    batch.update(
        ref,
        {
            "status": SubscriptionStatus.CANCELLED.value,
            "last_event_at": event_time,
            "updated_at": datetime.now(UTC),
        },
    )


STRIPE_HANDLERS = {
    "checkout.session.completed": handle_checkout_session_completed,
    "invoice.payment_succeeded": handle_invoice_payment_succeeded,
    "invoice.payment_failed": handle_invoice_payment_failed,
    "customer.subscription.updated": handle_subscription_updated,
    "customer.subscription.deleted": handle_subscription_deleted,
}