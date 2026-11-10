"""Plan catalogue and lapse policy.

EVERY NUMBER IN THIS FILE IS PROVISIONAL until the business confirms
the plans, trial length and lapse rules. Trial length, grace period and
trial plan come from settings (env); the catalogue below can be replaced
entirely with the BILLING_PLANS_JSON env var.
"""

import json

from app.core.config import settings
from app.modules.billing.schemas import (
    PlanDefinition,
    PlanLimits,
    SubscriptionStatus,
)

TRIAL_DAYS = settings.BILLING_TRIAL_DAYS
PAST_DUE_GRACE_DAYS = settings.BILLING_GRACE_DAYS
TRIAL_PLAN_ID = settings.BILLING_TRIAL_PLAN_ID

_DEFAULT_PLANS: dict[str, PlanDefinition] = {
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


def _load_plans() -> dict[str, PlanDefinition]:
    """Return the plan catalogue: env JSON override, else the defaults above."""
    raw = settings.BILLING_PLANS_JSON.strip()
    if not raw:
        plans = dict(_DEFAULT_PLANS)
    else:
        try:
            data = json.loads(raw)
            plans = {
                plan_id: PlanDefinition(plan_id=plan_id, **body)
                for plan_id, body in data.items()
            }
        except (ValueError, TypeError) as exc:
            raise ValueError(f"BILLING_PLANS_JSON is invalid: {exc}") from exc
    if TRIAL_PLAN_ID not in plans:
        raise ValueError(f"Trial plan '{TRIAL_PLAN_ID}' is not in the catalogue.")
    return plans


PLANS: dict[str, PlanDefinition] = _load_plans()

# Statuses allowed to use paid features (chat, knowledge ingestion).
# PAST_DUE is allowed here; ports.effective_status ends it after the grace period.
STATUSES_WITH_ACCESS = frozenset(
    {
        SubscriptionStatus.TRIAL,
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
    }
)