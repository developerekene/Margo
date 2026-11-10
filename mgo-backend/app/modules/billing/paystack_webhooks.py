"""Paystack webhook verification and event handlers.

Security model:
  * The x-paystack-signature header (HMAC-SHA512 of the RAW body, keyed with
    the secret key) is verified before anything is parsed.
  * A charge is never trusted from the webhook body alone: charge.success
    re-fetches the transaction from Paystack (server to server) and uses the
    VERIFIED data to activate the subscription.
  * Event names were checked against Paystack's webhook documentation:
    charge.success, invoice.payment_failed, subscription.not_renew,
    subscription.disable. Anything else is acknowledged and ignored.

Paystack events carry no event id, so the idempotency key is a hash of the
raw body: a redelivery is byte-identical and therefore dedupes.
"""

import calendar
import hashlib
import hmac
import logging
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.modules.billing.plans import PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import SubscriptionStatus
from app.modules.billing.webhooks import (
    find_subscription,
    is_stale,
    past_due_update,
    record_invoice,
)

logger = logging.getLogger("margo")

_VERIFY_URL = "https://api.paystack.co/transaction/verify/"
_VERIFY_TIMEOUT_SECONDS = 20.0


# ---------------------------------------------------------------------------
# Verification helpers
# ---------------------------------------------------------------------------


def verify_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Constant-time check of the x-paystack-signature header."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


def event_key(event_name: str, raw_body: bytes) -> str:
    """Idempotency key for a delivery (identical redeliveries share it)."""
    return f"{event_name}__{hashlib.sha256(raw_body).hexdigest()[:40]}"


def verify_transaction(reference: str) -> dict:
    """Fetch the transaction from Paystack. Raises if it cannot be confirmed."""
    response = httpx.get(
        _VERIFY_URL + reference,
        headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
        timeout=_VERIFY_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Paystack verify returned HTTP {response.status_code}")
    body = response.json()
    if not body.get("status"):
        raise RuntimeError("Paystack verify reported failure")
    return body.get("data") or {}


# ---------------------------------------------------------------------------
# Plan mapping (configured plan codes / amounts)
# ---------------------------------------------------------------------------


def _plan_codes() -> dict[str, str]:
    return {
        "professional": settings.PAYSTACK_PLAN_PROFESSIONAL,
        "enterprise": settings.PAYSTACK_PLAN_ENTERPRISE,
    }


def _expected_amount(plan_id: str) -> int:
    return {
        "professional": settings.PAYSTACK_AMOUNT_PROFESSIONAL,
        "enterprise": settings.PAYSTACK_AMOUNT_ENTERPRISE,
    }.get(plan_id, 0)


def _plan_code_of(data: dict) -> str | None:
    for key in ("plan_object", "plan"):
        value = data.get(key)
        if isinstance(value, dict) and value.get("plan_code"):
            return value["plan_code"]
        if isinstance(value, str) and value:
            return value
    return None


def _plan_id_for_code(plan_code: str | None) -> str | None:
    if not plan_code:
        return None
    for plan_id, code in _plan_codes().items():
        if code and code == plan_code:
            return plan_id
    return None


def _parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC)


def _add_month(dt: datetime) -> datetime:
    """Add one calendar month (day clamped to the target month's length)."""
    month_index = dt.month  # 1..12
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _customer_code(data: dict) -> str | None:
    customer = data.get("customer")
    return customer.get("customer_code") if isinstance(customer, dict) else None


# ---------------------------------------------------------------------------
# Handlers - handler(db, batch, event); they only queue writes
# ---------------------------------------------------------------------------


def handle_charge_success(db, batch, event: dict) -> None:
    """charge.success - confirm with Paystack, then activate or renew."""
    reference = (event.get("data") or {}).get("reference")
    if not reference:
        logger.warning("charge.success without reference; ignored")
        return

    verified = verify_transaction(reference)  # raises -> 500 -> Paystack retries
    if verified.get("status") != "success":
        logger.info("charge.success not confirmed as success; ignored")
        return

    meta = verified.get("metadata")
    meta = meta if isinstance(meta, dict) else {}
    customer_code = _customer_code(verified)
    tenant_id = meta.get("tenant_id")

    ref = sub = None
    if tenant_id:
        ref, sub = find_subscription(db, "tenant_id", tenant_id)
    elif customer_code:
        ref, sub = find_subscription(db, "paystack_customer_code", customer_code)
    if ref is None:
        logger.info("charge.success does not match a Margo tenant; ignored")
        return

    plan_code = _plan_code_of(verified)
    plan_id = meta.get("plan_id") if tenant_id else None
    plan_id = plan_id or _plan_id_for_code(plan_code) or sub.get("plan_id")
    if plan_id not in PLANS or plan_id == TRIAL_PLAN_ID:
        logger.error("charge.success resolved to unusable plan '%s'", plan_id)
        return

    expected_code = _plan_codes().get(plan_id)
    if plan_code and expected_code and plan_code != expected_code:
        logger.error("charge.success plan code does not match plan '%s'", plan_id)
        return
    expected_amount = _expected_amount(plan_id)
    if expected_amount and verified.get("amount") != expected_amount:
        logger.error("charge.success amount does not match plan '%s'", plan_id)
        return

    paid_at = _parse_time(verified.get("paid_at"))
    if is_stale(sub, paid_at):
        logger.info("charge.success is stale; ignored")
        return

    now = datetime.now(UTC)
    update: dict = {
        "status": SubscriptionStatus.ACTIVE.value,
        "provider": "paystack",
        "plan_id": plan_id,
        "current_period_end": _add_month(paid_at),
        "grace_period_end": None,
        "last_event_at": paid_at,
        "updated_at": now,
    }
    if customer_code:
        update["paystack_customer_code"] = customer_code
    batch.update(ref, update)

    record_invoice(
        db,
        batch,
        tenant_id=sub["tenant_id"],
        provider="paystack",
        invoice_id=str(reference),
        amount_cents=int(verified.get("amount") or 0),
        currency=verified.get("currency", ""),
        status="paid",
        date=paid_at,
        description=PLANS[plan_id].name,
    )
    logger.info("Subscription activated via Paystack: tenant=%s plan=%s",
                sub["tenant_id"], plan_id)


def _sub_for_event(db, event: dict):
    code = _customer_code(event.get("data") or {})
    if not code:
        return None, None
    return find_subscription(db, "paystack_customer_code", code)


def handle_invoice_payment_failed(db, batch, event: dict) -> None:
    """invoice.payment_failed - PAST_DUE, grace window starts once."""
    ref, sub = _sub_for_event(db, event)
    if ref is None:
        logger.info("invoice.payment_failed: unknown Paystack customer; ignored")
        return
    batch.update(ref, past_due_update(sub, datetime.now(UTC)))


def handle_subscription_not_renew(db, batch, event: dict) -> None:
    """subscription.not_renew - access continues to the end of the period."""
    ref, _ = _sub_for_event(db, event)
    if ref is None:
        return
    batch.update(
        ref, {"cancel_at_period_end": True, "updated_at": datetime.now(UTC)}
    )


def handle_subscription_disable(db, batch, event: dict) -> None:
    """subscription.disable - cancelled; access ends at current_period_end."""
    ref, _ = _sub_for_event(db, event)
    if ref is None:
        return
    batch.update(
        ref,
        {
            "status": SubscriptionStatus.CANCELLED.value,
            "updated_at": datetime.now(UTC),
        },
    )


PAYSTACK_HANDLERS = {
    "charge.success": handle_charge_success,
    "invoice.payment_failed": handle_invoice_payment_failed,
    "subscription.not_renew": handle_subscription_not_renew,
    "subscription.disable": handle_subscription_disable,
}