"""Plan catalogue and lapse policy.

EVERY NUMBER IN THIS FILE IS PROVISIONAL until the business confirms
the plans, trial length and lapse rules. Keep them all here so the
confirmed values are a one-file change.
"""

from app.modules.billing.schemas import (
    PlanDefinition,
    PlanLimits,
    SubscriptionStatus,
)

TRIAL_DAYS = 14
PAST_DUE_GRACE_DAYS = 7
TRIAL_PLAN_ID = "starter"

PLANS: dict[str, PlanDefinition] = {
    "starter": PlanDefinition(
        plan_id="starter",
        name="Starter",
        limits=PlanLimits(
            users=3,
            documents=10,
            crawl_pages=100,
            monthly_messages=500,
            widget_domains=1,
        ),
    ),
    "professional": PlanDefinition(
        plan_id="professional",
        name="Professional",
        limits=PlanLimits(
            users=10,
            documents=100,
            crawl_pages=1000,
            monthly_messages=5000,
            widget_domains=3,
        ),
    ),
    "enterprise": PlanDefinition(
        plan_id="enterprise",
        name="Enterprise",
        limits=PlanLimits(
            users=100,
            documents=1000,
            crawl_pages=10000,
            monthly_messages=50000,
            widget_domains=10,
        ),
    ),
}

# Statuses allowed to use paid features (chat, knowledge ingestion).
# PAST_DUE is allowed here; the service ends it after the grace period.
STATUSES_WITH_ACCESS = frozenset(
    {
        SubscriptionStatus.TRIAL,
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
    }
)