"""Tests for billing entitlement ports.

All Firestore calls are mocked so these run without a Firebase emulator.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from app.modules.billing.plans import PAST_DUE_GRACE_DAYS, PLANS, TRIAL_PLAN_ID
from app.modules.billing.ports import (
    is_subscription_active,
    is_within_plan_limit,
    is_within_rate_limit,
)
from app.modules.billing.schemas import LimitedResource, SubscriptionStatus

TENANT_ID = "tenant-test-ports"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_db_with_subscription(data: dict | None):
    """Return a mock db whose subscriptions query returns the given data dict."""
    mock_db = MagicMock()
    if data is None:
        mock_db.collection.return_value.where.return_value.limit.return_value.get.return_value = []
    else:
        doc = MagicMock()
        doc.to_dict.return_value = data
        mock_db.collection.return_value.where.return_value.limit.return_value.get.return_value = [doc]
    return mock_db


def _sub_doc(
    status: SubscriptionStatus,
    plan_id: str = TRIAL_PLAN_ID,
    trial_end: datetime | None = None,
    updated_at: datetime | None = None,
    grace_period_end: datetime | None = None,
    current_period_end: datetime | None = None,
) -> dict:
    now = datetime.now(UTC)
    return {
        "subscription_id": "sub-1",
        "tenant_id": TENANT_ID,
        "plan_id": plan_id,
        "status": status.value,
        "trial_end": trial_end,
        "current_period_end": current_period_end,
        "grace_period_end": grace_period_end,
        "updated_at": updated_at or now,
        "created_at": now,
    }


# ===========================================================================
# is_subscription_active
# ===========================================================================


@patch("app.modules.billing.ports.get_db")
def test_active_trial_returns_true(mock_get_db):
    """TRIAL status with a future trial_end → active."""
    future = datetime.now(UTC) + timedelta(days=10)
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.TRIAL, trial_end=future)
    )
    assert is_subscription_active(TENANT_ID) is True


@patch("app.modules.billing.ports.get_db")
def test_expired_trial_returns_false(mock_get_db):
    """TRIAL status with a past trial_end → not active."""
    past = datetime.now(UTC) - timedelta(days=1)
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.TRIAL, trial_end=past)
    )
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_active_subscription_returns_true(mock_get_db):
    """ACTIVE status → always active."""
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.ACTIVE)
    )
    assert is_subscription_active(TENANT_ID) is True


@patch("app.modules.billing.ports.get_db")
def test_past_due_within_explicit_grace_period_returns_true(mock_get_db):
    """PAST_DUE with a future grace_period_end → still active."""
    future_grace = datetime.now(UTC) + timedelta(days=3)
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.PAST_DUE, grace_period_end=future_grace)
    )
    assert is_subscription_active(TENANT_ID) is True


@patch("app.modules.billing.ports.get_db")
def test_past_due_after_explicit_grace_period_returns_false(mock_get_db):
    """PAST_DUE with an expired grace_period_end → not active."""
    past_grace = datetime.now(UTC) - timedelta(days=1)
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.PAST_DUE, grace_period_end=past_grace)
    )
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_past_due_within_fallback_grace_period_returns_true(mock_get_db):
    """PAST_DUE with no grace_period_end but updated_at within grace window → active."""
    recent_update = datetime.now(UTC) - timedelta(days=2)  # within 7-day window
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.PAST_DUE, updated_at=recent_update)
    )
    assert is_subscription_active(TENANT_ID) is True


@patch("app.modules.billing.ports.get_db")
def test_past_due_outside_fallback_grace_period_returns_false(mock_get_db):
    """PAST_DUE with no grace_period_end and updated_at older than grace window → not active."""
    old_update = datetime.now(UTC) - timedelta(days=PAST_DUE_GRACE_DAYS + 1)
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.PAST_DUE, updated_at=old_update)
    )
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_suspended_returns_false(mock_get_db):
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.SUSPENDED)
    )
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_cancelled_returns_false(mock_get_db):
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.CANCELLED)
    )
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_no_subscription_returns_false(mock_get_db):
    """No subscription document → not active."""
    mock_get_db.return_value = _mock_db_with_subscription(None)
    assert is_subscription_active(TENANT_ID) is False


@patch("app.modules.billing.ports.get_db")
def test_firestore_error_returns_false(mock_get_db):
    """Firestore error → fail closed (False, not an exception to the caller)."""
    mock_get_db.return_value.collection.return_value.where.return_value.limit.return_value.get.side_effect = RuntimeError("Firestore down")
    assert is_subscription_active(TENANT_ID) is False


# ===========================================================================
# is_within_plan_limit
# ===========================================================================


@patch("app.modules.billing.ports.get_db")
def test_users_under_limit_returns_true(mock_get_db):
    """User count below the starter plan limit → within limit."""
    starter_limit = PLANS[TRIAL_PLAN_ID].limits.users  # 3
    mock_db = MagicMock()

    # Subscription query
    sub_doc = MagicMock()
    sub_doc.to_dict.return_value = _sub_doc(SubscriptionStatus.ACTIVE)

    # Members subcollection — 1 user, well under limit of 3
    member = MagicMock()
    mock_db.collection.return_value.where.return_value.limit.return_value.get.return_value = [sub_doc]
    mock_db.collection.return_value.document.return_value.collection.return_value.get.return_value = [member]

    mock_get_db.return_value = mock_db
    assert is_within_plan_limit(TENANT_ID, LimitedResource.USERS.value) is True


@patch("app.modules.billing.ports.get_db")
def test_users_at_limit_returns_false(mock_get_db):
    """User count at (not under) the limit → not within limit."""
    starter_limit = PLANS[TRIAL_PLAN_ID].limits.users  # 3
    mock_db = MagicMock()

    sub_doc = MagicMock()
    sub_doc.to_dict.return_value = _sub_doc(SubscriptionStatus.ACTIVE)

    # Exactly at limit — 3 members
    members = [MagicMock() for _ in range(starter_limit)]
    mock_db.collection.return_value.where.return_value.limit.return_value.get.return_value = [sub_doc]
    mock_db.collection.return_value.document.return_value.collection.return_value.get.return_value = members

    mock_get_db.return_value = mock_db
    assert is_within_plan_limit(TENANT_ID, LimitedResource.USERS.value) is False


@patch("app.modules.billing.ports.get_db")
def test_no_subscription_returns_false_for_plan_limit(mock_get_db):
    """No subscription → not within any plan limit."""
    mock_get_db.return_value = _mock_db_with_subscription(None)
    assert is_within_plan_limit(TENANT_ID, LimitedResource.USERS.value) is False


@patch("app.modules.billing.ports.get_db")
def test_unknown_resource_returns_true(mock_get_db):
    """Unknown resource name → allowed by default."""
    mock_get_db.return_value = _mock_db_with_subscription(
        _sub_doc(SubscriptionStatus.ACTIVE)
    )
    assert is_within_plan_limit(TENANT_ID, "nonexistent_resource") is True


@patch("app.modules.billing.ports.get_db")
def test_monthly_messages_under_limit(mock_get_db):
    """Monthly message counter below limit → within limit."""
    from datetime import UTC, datetime
    mock_db = MagicMock()

    sub_doc = MagicMock()
    sub_doc.to_dict.return_value = _sub_doc(SubscriptionStatus.ACTIVE)

    month_key = datetime.now(UTC).strftime("%Y_%m")
    resource = LimitedResource.MONTHLY_MESSAGES.value
    field = f"{resource}_{month_key}"

    counter_doc = MagicMock()
    counter_doc.exists = True
    counter_doc.to_dict.return_value = {field: 10}  # well under 500 starter limit

    # subscription query returns sub_doc; usage_counters query returns counter_doc
    def collection_side_effect(name):
        col = MagicMock()
        if name == "subscriptions":
            col.where.return_value.limit.return_value.get.return_value = [sub_doc]
        elif name == "usage_counters":
            col.document.return_value.get.return_value = counter_doc
        return col

    mock_db.collection.side_effect = collection_side_effect
    mock_get_db.return_value = mock_db

    assert is_within_plan_limit(TENANT_ID, resource) is True


# ===========================================================================
# is_within_rate_limit
# ===========================================================================


@patch("app.modules.billing.ports.is_within_plan_limit")
def test_send_message_delegates_to_monthly_messages(mock_limit):
    """send_message action maps to monthly_messages resource."""
    mock_limit.return_value = True
    result = is_within_rate_limit(TENANT_ID, "send_message")
    assert result is True
    mock_limit.assert_called_once_with(TENANT_ID, LimitedResource.MONTHLY_MESSAGES.value)


@patch("app.modules.billing.ports.is_within_plan_limit")
def test_crawl_page_delegates_to_crawl_pages(mock_limit):
    """crawl_page action maps to crawl_pages resource."""
    mock_limit.return_value = False
    result = is_within_rate_limit(TENANT_ID, "crawl_page")
    assert result is False
    mock_limit.assert_called_once_with(TENANT_ID, LimitedResource.CRAWL_PAGES.value)


def test_unknown_action_returns_true():
    """Unknown action → allowed by default, no exception."""
    result = is_within_rate_limit(TENANT_ID, "this_action_does_not_exist")
    assert result is True
