"""Billing module's public interface for other modules.

chat, knowledge, and any other module that needs to gate on billing state
must import exclusively from this file. Never import from billing.service,
billing.schemas, or any other billing internal.

Uses app.shared.container.get_db() for Firestore access — never
app.core.firebase or firebase_admin directly (import linter rule).
"""

import logging
from datetime import UTC, datetime, timedelta

from app.modules.billing.plans import PAST_DUE_GRACE_DAYS, PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import LimitedResource, SubscriptionStatus
from app.shared.container import get_db

logger = logging.getLogger("margo")

# Maps rate-limited action names to their corresponding plan resource field.
# Add a new entry here when a new rate-limited action is introduced —
# no other code changes needed.
_ACTION_TO_RESOURCE: dict[str, str] = {
    "send_message": LimitedResource.MONTHLY_MESSAGES.value,
    "crawl_page": LimitedResource.CRAWL_PAGES.value,
}


def is_subscription_active(tenant_id: str) -> bool:
    """Return True if the tenant's subscription permits feature access.

    TRIAL  — True while trial_end is in the future.
    ACTIVE — always True.
    PAST_DUE — True within the grace period:
        uses grace_period_end if set (written by the webhook handler),
        falls back to updated_at + PAST_DUE_GRACE_DAYS otherwise.
    SUSPENDED / CANCELLED / EXPIRED — False.
    No subscription, unknown status, Firestore error — False.
    """
    try:
        db = get_db()
        docs = (
            db.collection("subscriptions")
            .where("tenant_id", "==", tenant_id)
            .limit(1)
            .get()
        )
    except Exception:
        logger.exception(
            "Firestore error checking subscription for tenant=%s", tenant_id
        )
        # Fail closed — don't grant access when we can't verify the subscription.
        return False

    if not docs:
        return False

    data = docs[0].to_dict()

    try:
        status = SubscriptionStatus(data.get("status", ""))
    except ValueError:
        logger.warning(
            "Unknown subscription status '%s' for tenant=%s",
            data.get("status"),
            tenant_id,
        )
        return False

    now = datetime.now(UTC)

    if status == SubscriptionStatus.TRIAL:
        trial_end = data.get("trial_end")
        if trial_end is None:
            return False
        return _ensure_utc(trial_end) > now

    if status == SubscriptionStatus.ACTIVE:
        return True

    if status == SubscriptionStatus.PAST_DUE:
        # Prefer the explicit grace_period_end written by the webhook handler.
        # Fall back to updated_at + grace days while webhooks are pending (Step 6).
        grace_end = data.get("grace_period_end")
        if grace_end is not None:
            return _ensure_utc(grace_end) > now
        updated_at = data.get("updated_at")
        if updated_at is None:
            # No reference point — give benefit of the doubt.
            return True
        return _ensure_utc(updated_at) + timedelta(days=PAST_DUE_GRACE_DAYS) > now

    # SUSPENDED, CANCELLED, EXPIRED
    return False


def is_within_plan_limit(tenant_id: str, resource: str) -> bool:
    """Return True if the tenant's current usage is below their plan limit.

    resource must be a LimitedResource value string (e.g. "monthly_messages").
    Returns True for unknown resources (logged as a warning).
    Fails open on Firestore errors — don't block users on infrastructure issues.
    """
    try:
        db = get_db()
        docs = (
            db.collection("subscriptions")
            .where("tenant_id", "==", tenant_id)
            .limit(1)
            .get()
        )
    except Exception:
        logger.exception(
            "Firestore error fetching subscription for plan limit check, tenant=%s",
            tenant_id,
        )
        return True  # Fail open.

    if not docs:
        return False

    plan_id = docs[0].to_dict().get("plan_id", TRIAL_PLAN_ID)
    plan = PLANS.get(plan_id)
    if plan is None:
        logger.error(
            "Unknown plan_id '%s' for tenant=%s in plan limit check",
            plan_id,
            tenant_id,
        )
        return False

    limit = getattr(plan.limits, resource, None)
    if limit is None:
        logger.warning(
            "Unknown resource '%s' in plan limit check for tenant=%s",
            resource,
            tenant_id,
        )
        return True  # Unknown resources are allowed by default.

    try:
        current = _get_current_usage(db, tenant_id, resource)
    except Exception:
        logger.exception(
            "Failed to read usage for tenant=%s resource=%s", tenant_id, resource
        )
        return True  # Fail open on usage read error.

    return current < limit


def is_within_rate_limit(tenant_id: str, action: str) -> bool:
    """Return True if the tenant may perform action under their plan.

    Delegates to is_within_plan_limit after mapping the action to a resource.
    Unknown actions are allowed by default (logged as a warning).
    """
    resource = _ACTION_TO_RESOURCE.get(action)
    if resource is None:
        logger.warning(
            "Unknown rate-limited action '%s' for tenant=%s", action, tenant_id
        )
        return True
    return is_within_plan_limit(tenant_id, resource)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _ensure_utc(dt: datetime) -> datetime:
    """Return a UTC-aware datetime from either a naive or aware datetime.

    Firestore returns DatetimeWithNanoseconds (always aware), but defensive
    handling of naive datetimes avoids comparison errors in tests.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _get_current_usage(db, tenant_id: str, resource: str) -> int:
    """Read the live usage count for a resource from Firestore.

    Callers are responsible for catching exceptions raised by Firestore.
    """
    if resource == LimitedResource.USERS.value:
        members = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("members")
            .get()
        )
        return len(members)

    if resource == LimitedResource.DOCUMENTS.value:
        # This subcollection is populated by BE-005.
        # Returns 0 until that ticket is implemented.
        docs = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("documents")
            .get()
        )
        return len(docs)

    if resource == LimitedResource.WIDGET_DOMAINS.value:
        # Count total allowed domain entries across all widgets for this tenant.
        widgets = (
            db.collection("widgets")
            .where("tenant_id", "==", tenant_id)
            .get()
        )
        return sum(len(w.to_dict().get("allowed_domains", [])) for w in widgets)

    if resource in (
        LimitedResource.CRAWL_PAGES.value,
        LimitedResource.MONTHLY_MESSAGES.value,
    ):
        # Monthly counters: usage_counters/{tenant_id}
        # Field: {resource}_{YYYY_MM}, e.g. "monthly_messages_2025_10"
        month_key = datetime.now(UTC).strftime("%Y_%m")
        field = f"{resource}_{month_key}"
        counter_doc = db.collection("usage_counters").document(tenant_id).get()
        if not counter_doc.exists:
            return 0
        return counter_doc.to_dict().get(field, 0)

    return 0
