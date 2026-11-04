"""Billing module's public interface for other modules.

chat, knowledge, and any other module that needs to gate on billing state
must import exclusively from this file. Never import from billing.service,
billing.schemas, or any other billing internal.

Uses app.shared.container.get_db() for Firestore access - never
app.core.firebase or firebase_admin directly (import linter rule).

Failure policy (explicit): when billing data cannot be read, every check
FAILS CLOSED (returns False / READ_ONLY) and logs the error. Callers must
treat False as "not allowed right now", never as "unlimited".

Who calls what (expected):
  chat       -> is_subscription_active, reserve_usage("monthly_messages")
  knowledge  -> is_subscription_active, reserve_usage("crawl_pages"),
                is_within_plan_limit("documents")
  identity   -> is_within_plan_limit("users"), ("widget_domains")
  any module -> get_access_level for the read-only dashboard rule
"""

import logging
from datetime import UTC, datetime, timedelta

from google.cloud.firestore_v1 import Increment, transactional

from app.modules.billing.constants import SUBSCRIPTIONS, USAGE_COUNTERS
from app.modules.billing.plans import PAST_DUE_GRACE_DAYS, PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import (
    AccessLevel,
    LimitedResource,
    SubscriptionStatus,
)
from app.shared.container import get_db

logger = logging.getLogger("margo")

# Explicit registry of billable actions -> the plan resource they consume.
# An action that is not listed here is DENIED (and logged), so a new billable
# operation cannot bypass enforcement by simply not being mapped.
BILLABLE_ACTIONS: dict[str, str] = {
    "send_message": LimitedResource.MONTHLY_MESSAGES.value,
    "crawl_page": LimitedResource.CRAWL_PAGES.value,
}

# Resources tracked by a monthly counter (the others are counted live).
COUNTER_RESOURCES = frozenset(
    {
        LimitedResource.MONTHLY_MESSAGES.value,
        LimitedResource.CRAWL_PAGES.value,
    }
)

_STATUSES_WITH_ACCESS = frozenset(
    {
        SubscriptionStatus.TRIAL,
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
    }
)


# ---------------------------------------------------------------------------
# Subscription state
# ---------------------------------------------------------------------------


def ensure_utc(dt: datetime) -> datetime:
    """Return a UTC-aware datetime from either a naive or aware datetime."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def load_subscription(db, tenant_id: str) -> dict | None:
    """Return the tenant's subscription dict, or None. Raises on read errors."""
    docs = (
        db.collection(SUBSCRIPTIONS)
        .where("tenant_id", "==", tenant_id)
        .limit(1)
        .get()
    )
    if not docs:
        return None
    return docs[0].to_dict()


def effective_status(data: dict, now: datetime | None = None) -> SubscriptionStatus:
    """Compute the status a tenant effectively has right now.

    Applies time-based transitions on read, so no background job is needed:
      TRIAL    past trial_end (or no trial_end)        -> EXPIRED
      PAST_DUE past the grace period (or no reference) -> SUSPENDED
    """
    now = now or datetime.now(UTC)
    try:
        status = SubscriptionStatus(data.get("status", ""))
    except ValueError:
        logger.warning("Unknown subscription status '%s'", data.get("status"))
        return SubscriptionStatus.SUSPENDED

    if status == SubscriptionStatus.TRIAL:
        trial_end = data.get("trial_end")
        if trial_end is None or ensure_utc(trial_end) <= now:
            return SubscriptionStatus.EXPIRED
        return status

    if status == SubscriptionStatus.PAST_DUE:
        grace_end = data.get("grace_period_end")
        if grace_end is None:
            # Fallback for records written before grace_period_end existed.
            # With no reference timestamp at all we deny - never grant
            # open-ended access.
            updated_at = data.get("updated_at")
            if updated_at is None:
                return SubscriptionStatus.SUSPENDED
            grace_end = ensure_utc(updated_at) + timedelta(days=PAST_DUE_GRACE_DAYS)
        if ensure_utc(grace_end) <= now:
            return SubscriptionStatus.SUSPENDED
        return status

    return status


def _access_for(data: dict, now: datetime | None = None) -> AccessLevel:
    """Map a subscription record to FULL or READ_ONLY."""
    now = now or datetime.now(UTC)
    status = effective_status(data, now)
    if status in _STATUSES_WITH_ACCESS:
        return AccessLevel.FULL
    if status == SubscriptionStatus.CANCELLED:
        # Cancellation takes effect at the end of the paid period.
        period_end = data.get("current_period_end")
        if period_end is not None and ensure_utc(period_end) > now:
            return AccessLevel.FULL
    return AccessLevel.READ_ONLY


def access_level_for(data: dict) -> AccessLevel:
    """Public wrapper so the service can reuse the same access rules."""
    return _access_for(data)


def get_access_level(tenant_id: str) -> AccessLevel:
    """FULL keeps the public widget and writes on; READ_ONLY turns them off.

    READ_ONLY means: widget suspended, dashboard reads only. Checkout,
    subscription, invoices and login must stay allowed. Fails closed.
    """
    try:
        data = load_subscription(get_db(), tenant_id)
    except Exception:
        logger.exception("Firestore error reading subscription tenant=%s", tenant_id)
        return AccessLevel.READ_ONLY
    if data is None:
        return AccessLevel.READ_ONLY
    return _access_for(data)


def is_subscription_active(tenant_id: str) -> bool:
    """Return True if the tenant's subscription permits feature access.

    No subscription, unknown status or a Firestore error -> False.
    """
    return get_access_level(tenant_id) == AccessLevel.FULL


# ---------------------------------------------------------------------------
# Plan limits and usage
# ---------------------------------------------------------------------------


def _limit_for(data: dict, resource: str) -> int | None:
    """Return the plan limit for a resource, or None if it cannot be resolved."""
    plan_id = data.get("plan_id", TRIAL_PLAN_ID)
    plan = PLANS.get(plan_id)
    if plan is None:
        logger.error("Unknown plan_id '%s' in plan limit check", plan_id)
        return None
    limit = getattr(plan.limits, resource, None)
    if limit is None:
        logger.error("Unknown billing resource '%s'", resource)
        return None
    return limit


def _month_field(resource: str) -> str:
    """Counter field for the current UTC calendar month, e.g. x_2026_11."""
    return f"{resource}_{datetime.now(UTC).strftime('%Y_%m')}"


def _get_current_usage(db, tenant_id: str, resource: str) -> int:
    """Read the live usage count for a resource. Raises on Firestore errors."""
    if resource == LimitedResource.USERS.value:
        members = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("members")
            .get()
        )
        return len(members)

    if resource == LimitedResource.DOCUMENTS.value:
        # Populated by BE-005; agree the collection shape with that ticket.
        docs = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("documents")
            .get()
        )
        return len(docs)

    if resource == LimitedResource.WIDGET_DOMAINS.value:
        widgets = db.collection("widgets").where("tenant_id", "==", tenant_id).get()
        return sum(len(w.to_dict().get("allowed_domains", [])) for w in widgets)

    if resource in COUNTER_RESOURCES:
        counter_doc = db.collection(USAGE_COUNTERS).document(tenant_id).get()
        if not counter_doc.exists:
            return 0  # No counter yet is genuinely zero usage.
        return counter_doc.to_dict().get(_month_field(resource), 0)

    raise ValueError(f"Unknown billing resource '{resource}'")


def get_usage(tenant_id: str, resource: str) -> int:
    """Return current usage. Raises on errors (callers decide how to react)."""
    return _get_current_usage(get_db(), tenant_id, resource)


def is_within_plan_limit(tenant_id: str, resource: str, requested: int = 1) -> bool:
    """Return True if `requested` more units fit within the plan limit.

    Fails CLOSED: a missing subscription, unknown plan/resource, or any
    Firestore error returns False (logged). This is a preliminary check; for
    counters use reserve_usage, which checks and increments atomically.
    """
    try:
        db = get_db()
        data = load_subscription(db, tenant_id)
        if data is None:
            return False
        limit = _limit_for(data, resource)
        if limit is None:
            return False
        current = _get_current_usage(db, tenant_id, resource)
    except Exception:
        logger.exception(
            "Billing check failed (denying) tenant=%s resource=%s", tenant_id, resource
        )
        return False
    return current + requested <= limit


def is_within_rate_limit(tenant_id: str, action: str) -> bool:
    """Return True if the tenant may perform `action` under their plan.

    Unknown actions are denied: add new billable actions to BILLABLE_ACTIONS.
    """
    resource = BILLABLE_ACTIONS.get(action)
    if resource is None:
        logger.error("Unregistered billable action '%s' (denied)", action)
        return False
    return is_within_plan_limit(tenant_id, resource)


def record_usage(tenant_id: str, resource: str, amount: int = 1) -> None:
    """Atomically add `amount` to this month's counter.

    Call AFTER the operation succeeded, so failed operations do not consume
    usage. For limit enforcement prefer reserve_usage. Raises on errors.
    """
    if resource not in COUNTER_RESOURCES:
        raise ValueError(f"'{resource}' is not a counted resource")
    ref = get_db().collection(USAGE_COUNTERS).document(tenant_id)
    ref.set({_month_field(resource): Increment(amount)}, merge=True)


def reserve_usage(tenant_id: str, resource: str, amount: int = 1) -> bool:
    """Check the plan limit and consume `amount` in ONE Firestore transaction.

    Returns False when it would exceed the limit (nothing is consumed) or when
    billing data cannot be verified (fail closed). Safe under concurrency:
    two requests cannot both take the last unit.
    """
    if resource not in COUNTER_RESOURCES:
        raise ValueError(f"'{resource}' is not a counted resource")
    try:
        db = get_db()
        data = load_subscription(db, tenant_id)
        if data is None:
            return False
        limit = _limit_for(data, resource)
        if limit is None:
            return False

        ref = db.collection(USAGE_COUNTERS).document(tenant_id)
        field = _month_field(resource)

        @transactional
        def _reserve(transaction) -> bool:
            snap = ref.get(transaction=transaction)
            current = snap.to_dict().get(field, 0) if snap.exists else 0
            if current + amount > limit:
                return False
            transaction.set(ref, {field: current + amount}, merge=True)
            return True

        return _reserve(db.transaction())
    except Exception:
        logger.exception(
            "Usage reservation failed (denying) tenant=%s resource=%s",
            tenant_id,
            resource,
        )
        return False