"""Tests for billing.ports: effective status, access level, usage and limits."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from app.modules.billing import ports
from app.modules.billing.plans import PLANS
from app.modules.billing.schemas import (
    AccessLevel,
    LimitedResource,
    SubscriptionStatus,
)
from tests.fake_firestore import subscription_doc

NOW = datetime.now(UTC)
MSG = LimitedResource.MONTHLY_MESSAGES.value
PAGES = LimitedResource.CRAWL_PAGES.value
S = SubscriptionStatus
SUB = "subscriptions/t-1"
STARTER = PLANS["starter"].limits


@pytest.fixture
def no_transaction():
    """Firestore's real transaction wrapper needs a live client; the fake DB
    is single-threaded, so running the function directly is equivalent."""
    with patch.object(ports, "transactional", lambda fn: fn):
        yield


def seed(fake_db, **overrides):
    fake_db.put(SUB, subscription_doc("t-1", **overrides))


# ---------------------------------------------------------------------------
# effective_status
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("record", "expected"),
    [
        ({"status": S.TRIAL.value, "trial_end": NOW + timedelta(days=1)}, S.TRIAL),
        ({"status": S.TRIAL.value, "trial_end": NOW - timedelta(days=1)}, S.EXPIRED),
        ({"status": S.TRIAL.value}, S.EXPIRED),
        ({"status": S.ACTIVE.value}, S.ACTIVE),
        (
            {"status": S.PAST_DUE.value, "grace_period_end": NOW + timedelta(days=1)},
            S.PAST_DUE,
        ),
        (
            {"status": S.PAST_DUE.value, "grace_period_end": NOW - timedelta(days=1)},
            S.SUSPENDED,
        ),
        (
            {"status": S.PAST_DUE.value, "updated_at": NOW - timedelta(days=1)},
            S.PAST_DUE,
        ),
        (
            {"status": S.PAST_DUE.value, "updated_at": NOW - timedelta(days=365)},
            S.SUSPENDED,
        ),
        # No timestamp at all must never grant open-ended access.
        ({"status": S.PAST_DUE.value}, S.SUSPENDED),
        ({"status": "bogus"}, S.SUSPENDED),
    ],
)
def test_effective_status(record, expected):
    assert ports.effective_status(record, NOW) == expected


@pytest.mark.parametrize(
    ("record", "expected"),
    [
        ({"status": S.ACTIVE.value}, AccessLevel.FULL),
        (
            {"status": S.TRIAL.value, "trial_end": NOW + timedelta(days=2)},
            AccessLevel.FULL,
        ),
        (
            {"status": S.TRIAL.value, "trial_end": NOW - timedelta(days=2)},
            AccessLevel.READ_ONLY,
        ),
        (
            {"status": S.PAST_DUE.value, "grace_period_end": NOW + timedelta(days=2)},
            AccessLevel.FULL,
        ),
        ({"status": S.PAST_DUE.value}, AccessLevel.READ_ONLY),
        (
            {"status": S.CANCELLED.value, "current_period_end": NOW + timedelta(days=5)},
            AccessLevel.FULL,
        ),
        (
            {"status": S.CANCELLED.value, "current_period_end": NOW - timedelta(days=5)},
            AccessLevel.READ_ONLY,
        ),
        ({"status": S.CANCELLED.value}, AccessLevel.READ_ONLY),
        ({"status": S.SUSPENDED.value}, AccessLevel.READ_ONLY),
    ],
)
def test_access_level(record, expected):
    assert ports._access_for(record, NOW) == expected


def test_no_subscription_is_not_active(fake_db):
    assert ports.is_subscription_active("t-1") is False
    assert ports.get_access_level("t-1") == AccessLevel.READ_ONLY


def test_active_subscription_is_active(fake_db):
    seed(fake_db, status=S.ACTIVE.value)
    assert ports.is_subscription_active("t-1") is True


def test_subscription_read_error_fails_closed(fake_db):
    with patch.object(ports, "load_subscription", side_effect=RuntimeError("down")):
        assert ports.is_subscription_active("t-1") is False
        assert ports.get_access_level("t-1") == AccessLevel.READ_ONLY


# ---------------------------------------------------------------------------
# record_usage / get_usage
# ---------------------------------------------------------------------------


def test_record_usage_increments_counter(fake_db):
    seed(fake_db)
    ports.record_usage("t-1", MSG)
    ports.record_usage("t-1", MSG, amount=4)
    assert ports.get_usage("t-1", MSG) == 5
    assert ports.get_usage("t-1", PAGES) == 0  # other resources unaffected


def test_record_usage_rejects_uncounted_resource(fake_db):
    with pytest.raises(ValueError):
        ports.record_usage("t-1", LimitedResource.USERS.value)


def test_usage_is_per_calendar_month(fake_db):
    """A counter from another month must not count toward this month."""
    fake_db.put("usage_counters/t-1", {f"{MSG}_2020_01": 400})
    assert ports.get_usage("t-1", MSG) == 0


# ---------------------------------------------------------------------------
# reserve_usage (atomic check + consume)
# ---------------------------------------------------------------------------


def test_reserve_usage_stops_exactly_at_the_limit(fake_db, no_transaction):
    seed(fake_db)
    fake_db.put(
        "usage_counters/t-1", {ports._month_field(MSG): STARTER.monthly_messages - 1}
    )
    assert ports.reserve_usage("t-1", MSG) is True
    assert ports.reserve_usage("t-1", MSG) is False
    assert ports.get_usage("t-1", MSG) == STARTER.monthly_messages


def test_reserve_usage_denied_consumes_nothing(fake_db, no_transaction):
    seed(fake_db)
    fake_db.put("usage_counters/t-1", {ports._month_field(MSG): STARTER.monthly_messages})
    assert ports.reserve_usage("t-1", MSG) is False
    assert ports.get_usage("t-1", MSG) == STARTER.monthly_messages


def test_reserve_usage_without_subscription_is_denied(fake_db, no_transaction):
    assert ports.reserve_usage("t-1", MSG) is False


def test_reserve_usage_unknown_plan_is_denied(fake_db, no_transaction):
    seed(fake_db, plan_id="platinum")
    assert ports.reserve_usage("t-1", MSG) is False


def test_reserve_usage_fails_closed_on_error(fake_db, no_transaction):
    with patch.object(ports, "load_subscription", side_effect=RuntimeError("down")):
        assert ports.reserve_usage("t-1", MSG) is False


def test_reserve_usage_rejects_uncounted_resource(fake_db):
    with pytest.raises(ValueError):
        ports.reserve_usage("t-1", LimitedResource.DOCUMENTS.value)


# ---------------------------------------------------------------------------
# is_within_plan_limit / is_within_rate_limit
# ---------------------------------------------------------------------------


def add_members(fake_db, count):
    for i in range(count):
        fake_db.put(f"tenants/t-1/members/u{i}", {"role": "company_member"})


def test_users_limit_boundaries(fake_db):
    seed(fake_db)
    users = LimitedResource.USERS.value
    add_members(fake_db, STARTER.users - 1)
    assert ports.is_within_plan_limit("t-1", users) is True  # one slot left
    assert ports.is_within_plan_limit("t-1", users, requested=2) is False
    add_members(fake_db, STARTER.users)
    assert ports.is_within_plan_limit("t-1", users) is False  # exactly full


def test_widget_domains_are_summed_across_widgets(fake_db):
    seed(fake_db)
    fake_db.put("widgets/w1", {"tenant_id": "t-1", "allowed_domains": ["a.com"]})
    fake_db.put("widgets/w2", {"tenant_id": "t-2", "allowed_domains": ["x.com", "y.com"]})
    assert ports.get_usage("t-1", LimitedResource.WIDGET_DOMAINS.value) == 1


def test_plan_limit_without_subscription_is_denied(fake_db):
    assert ports.is_within_plan_limit("t-1", LimitedResource.USERS.value) is False


def test_plan_limit_fails_closed_on_read_error(fake_db):
    seed(fake_db)
    with patch.object(ports, "_get_current_usage", side_effect=RuntimeError("down")):
        assert ports.is_within_plan_limit("t-1", LimitedResource.USERS.value) is False


def test_rate_limit_uses_registered_actions(fake_db):
    seed(fake_db)
    assert ports.is_within_rate_limit("t-1", "send_message") is True
    fake_db.put("usage_counters/t-1", {ports._month_field(MSG): STARTER.monthly_messages})
    assert ports.is_within_rate_limit("t-1", "send_message") is False


def test_rate_limit_denies_unregistered_action(fake_db):
    seed(fake_db)
    assert ports.is_within_rate_limit("t-1", "brand_new_action") is False