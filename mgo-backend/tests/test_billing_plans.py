from app.modules.billing.plans import PLANS, TRIAL_PLAN_ID
from app.modules.billing.schemas import LimitedResource, PlanLimits


def test_trial_plan_exists():
    assert TRIAL_PLAN_ID in PLANS


def test_every_plan_defines_every_limited_resource():
    for plan in PLANS.values():
        for resource in LimitedResource:
            assert hasattr(plan.limits, resource.value)


def test_limit_fields_match_limited_resources():
    assert set(PlanLimits.model_fields) == {r.value for r in LimitedResource}