"""Billing service — business logic for subscriptions, limits, and access."""
import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import stripe

from app.core.config import settings
from app.core.responses import AppError
from app.modules.billing.plans import PLANS, TRIAL_DAYS, TRIAL_PLAN_ID
from app.modules.billing.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentProvider,
    SubscriptionResponse,
    SubscriptionStatus,
    UsageSummary,
)
from app.shared.container import get_db

logger = logging.getLogger("margo")


def create_trial_subscription(tenant_id: str, admin_email: str) -> None:
    """Create a TRIAL subscription for a newly registered tenant.

    Idempotent: if a subscription already exists for this tenant, no-op.
    Called by the TenantRegistered event handler.

    Uses app.shared.container.get_db() for Firestore access — billing must
    never import app.core.firebase or firebase_admin directly (import linter rule).
    """
    try:
        db = get_db()
        subscriptions = db.collection("subscriptions")

        # Idempotency check: skip if a trial already exists for this tenant.
        existing = subscriptions.where("tenant_id", "==", tenant_id).limit(1).get()
        if len(existing) > 0:
            logger.info(
                "Trial already exists for tenant=%s, skipping creation.", tenant_id
            )
            return

        now = datetime.now(UTC)
        subscription_id = str(uuid.uuid4())

        subscriptions.document(subscription_id).set(
            {
                "subscription_id": subscription_id,
                "tenant_id": tenant_id,
                "plan_id": TRIAL_PLAN_ID,
                "status": SubscriptionStatus.TRIAL.value,
                "trial_end": now + timedelta(days=TRIAL_DAYS),
                # admin_email is stored for provider checkout initialization
                # (Paystack requires an email to initialize a transaction).
                "admin_email": admin_email,
                "created_at": now,
                "updated_at": now,
            }
        )

        logger.info(
            "Trial subscription created: id=%s tenant=%s plan=%s trial_days=%d",
            subscription_id,
            tenant_id,
            TRIAL_PLAN_ID,
            TRIAL_DAYS,
        )

    except Exception:
        # Billing failure must not block tenant registration.
        # Log for alerting; the tenant can have their trial provisioned manually.
        logger.exception(
            "Failed to create trial subscription for tenant=%s email=%s",
            tenant_id,
            admin_email,
        )


def get_subscription(tenant_id: str) -> SubscriptionResponse:
    """Return the active subscription for a tenant.

    Raises AppError(subscription_not_found, 404) if no subscription document
    exists for this tenant — callers should not assume a trial was created.
    """
    db = get_db()
    docs = (
        db.collection("subscriptions")
        .where("tenant_id", "==", tenant_id)
        .limit(1)
        .get()
    )

    if not docs:
        raise AppError(
            code="subscription_not_found",
            message="No subscription found for this tenant.",
            status_code=404,
        )

    data = docs[0].to_dict()
    plan_id = data.get("plan_id", TRIAL_PLAN_ID)
    plan = PLANS.get(plan_id)

    if plan is None:
        # The stored plan_id has no matching catalogue entry — data integrity issue.
        logger.error(
            "Unknown plan_id '%s' for tenant=%s subscription=%s",
            plan_id,
            tenant_id,
            data.get("subscription_id"),
        )
        raise AppError(
            code="plan_not_found",
            message="Subscription references an unknown plan. Contact support.",
            status_code=500,
        )

    # Usage counters are stubbed as zeros until Step 9 implements real metering.
    usage = UsageSummary()

    return SubscriptionResponse(
        subscription_id=data["subscription_id"],
        tenant_id=data["tenant_id"],
        plan_id=plan.plan_id,
        plan_name=plan.name,
        status=SubscriptionStatus(data["status"]),
        trial_end=data.get("trial_end"),
        current_period_end=data.get("current_period_end"),
        provider=data.get("provider"),
        limits=plan.limits,
        usage=usage,
        created_at=data["created_at"],
    )


# ---------------------------------------------------------------------------
# Stripe checkout
# ---------------------------------------------------------------------------


def _stripe_price_id(plan_id: str) -> str:
    """Return the configured Stripe Price ID for a plan, or empty string."""
    return {
        "professional": settings.STRIPE_PRICE_PROFESSIONAL,
        "enterprise": settings.STRIPE_PRICE_ENTERPRISE,
    }.get(plan_id, "")


def create_stripe_checkout(tenant_id: str, request: CheckoutRequest) -> CheckoutResponse:
    """Create a Stripe Checkout Session and return the redirect URL.

    Flow:
    1. Validate Stripe config and plan.
    2. Get or create a Stripe Customer for this tenant (stored on the sub doc).
    3. Create a Checkout Session in subscription mode.
    4. Return the session URL — the webhook (Step 6) handles the post-payment upgrade.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise AppError(
            code="stripe_not_configured",
            message="Stripe is not configured on this server.",
            status_code=503,
        )

    plan = PLANS.get(request.plan_id)
    if plan is None:
        raise AppError(
            code="invalid_plan",
            message=f"Plan '{request.plan_id}' does not exist.",
            status_code=400,
        )

    if request.plan_id == TRIAL_PLAN_ID:
        raise AppError(
            code="invalid_plan",
            message="Cannot checkout the trial plan.",
            status_code=400,
        )

    price_id = _stripe_price_id(request.plan_id)
    if not price_id:
        raise AppError(
            code="stripe_not_configured",
            message=f"No Stripe price configured for plan '{request.plan_id}'.",
            status_code=503,
        )

    db = get_db()
    docs = (
        db.collection("subscriptions")
        .where("tenant_id", "==", tenant_id)
        .limit(1)
        .get()
    )
    if not docs:
        raise AppError(
            code="subscription_not_found",
            message="No subscription found for this tenant.",
            status_code=404,
        )

    sub_ref = docs[0].reference
    sub_data = docs[0].to_dict()

    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Reuse existing Stripe customer or create a new one.
    # Stored on the subscription doc for idempotency — repeated checkout
    # attempts for the same tenant reuse the same Stripe customer.
    stripe_customer_id = sub_data.get("stripe_customer_id")
    if not stripe_customer_id:
        customer = stripe.Customer.create(
            metadata={"tenant_id": tenant_id},
        )
        stripe_customer_id = customer.id
        sub_ref.update(
            {
                "stripe_customer_id": stripe_customer_id,
                "updated_at": datetime.now(UTC),
            }
        )
        logger.info(
            "Created Stripe customer: customer_id=%s tenant=%s",
            stripe_customer_id,
            tenant_id,
        )

    session = stripe.checkout.Session.create(
        customer=stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=settings.STRIPE_SUCCESS_URL,
        cancel_url=settings.STRIPE_CANCEL_URL,
        # Metadata is read by the checkout.session.completed webhook handler (Step 6).
        metadata={"tenant_id": tenant_id, "plan_id": request.plan_id},
    )

    logger.info(
        "Stripe checkout session created: session_id=%s tenant=%s plan=%s",
        session.id,
        tenant_id,
        request.plan_id,
    )

    return CheckoutResponse(
        checkout_url=session.url,
        provider=PaymentProvider.STRIPE,
    )


# ---------------------------------------------------------------------------
# Paystack checkout
# ---------------------------------------------------------------------------

_PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"


def _paystack_plan_code(plan_id: str) -> str:
    """Return the configured Paystack Plan Code for a plan, or empty string."""
    return {
        "professional": settings.PAYSTACK_PLAN_PROFESSIONAL,
        "enterprise": settings.PAYSTACK_PLAN_ENTERPRISE,
    }.get(plan_id, "")


def create_paystack_checkout(tenant_id: str, request: CheckoutRequest) -> CheckoutResponse:
    """Initialize a Paystack transaction and return the authorization_url.

    Flow:
    1. Validate Paystack config and plan.
    2. Read admin_email from the subscription doc (Paystack requires an email).
    3. POST to Paystack /transaction/initialize with the plan code.
    4. Return the authorization_url — the webhook handler upgrades the subscription.

    admin_email is stored on the subscription doc since create_trial_subscription.
    Existing trial docs without admin_email must be back-filled to use Paystack.
    """
    if not settings.PAYSTACK_SECRET_KEY:
        raise AppError(
            code="paystack_not_configured",
            message="Paystack is not configured on this server.",
            status_code=503,
        )

    plan = PLANS.get(request.plan_id)
    if plan is None:
        raise AppError(
            code="invalid_plan",
            message=f"Plan '{request.plan_id}' does not exist.",
            status_code=400,
        )

    if request.plan_id == TRIAL_PLAN_ID:
        raise AppError(
            code="invalid_plan",
            message="Cannot checkout the trial plan.",
            status_code=400,
        )

    plan_code = _paystack_plan_code(request.plan_id)
    if not plan_code:
        raise AppError(
            code="paystack_not_configured",
            message=f"No Paystack plan configured for plan '{request.plan_id}'.",
            status_code=503,
        )

    db = get_db()
    docs = (
        db.collection("subscriptions")
        .where("tenant_id", "==", tenant_id)
        .limit(1)
        .get()
    )
    if not docs:
        raise AppError(
            code="subscription_not_found",
            message="No subscription found for this tenant.",
            status_code=404,
        )

    sub_data = docs[0].to_dict()
    admin_email = sub_data.get("admin_email", "")
    if not admin_email:
        raise AppError(
            code="tenant_email_missing",
            message="Tenant email is not available. Contact support.",
            status_code=500,
        )

    try:
        response = httpx.post(
            _PAYSTACK_INITIALIZE_URL,
            json={
                "email": admin_email,
                "plan": plan_code,
                "callback_url": settings.PAYSTACK_CALLBACK_URL,
                # Metadata read by the charge.success webhook handler.
                "metadata": {"tenant_id": tenant_id, "plan_id": request.plan_id},
            },
            headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
            timeout=30.0,
        )
    except httpx.RequestError as exc:
        logger.error("Paystack API request failed: %s", exc)
        raise AppError(
            code="paystack_unavailable",
            message="Could not reach Paystack. Please try again.",
            status_code=502,
        )

    if not response.is_success:
        logger.error("Paystack initialization error: %s", response.text)
        raise AppError(
            code="paystack_error",
            message="Failed to initialize Paystack transaction.",
            status_code=502,
        )

    payload = response.json()
    if not payload.get("status"):
        raise AppError(
            code="paystack_error",
            message=payload.get("message", "Paystack returned an error."),
            status_code=502,
        )

    authorization_url = payload["data"]["authorization_url"]

    logger.info(
        "Paystack transaction initialized: tenant=%s plan=%s",
        tenant_id,
        request.plan_id,
    )

    return CheckoutResponse(
        checkout_url=authorization_url,
        provider=PaymentProvider.PAYSTACK,
    )


# ---------------------------------------------------------------------------
# Checkout dispatcher
# ---------------------------------------------------------------------------


def create_checkout(tenant_id: str, request: CheckoutRequest) -> CheckoutResponse:
    """Dispatch checkout creation to the requested provider."""
    if request.provider == PaymentProvider.STRIPE:
        return create_stripe_checkout(tenant_id, request)

    if request.provider == PaymentProvider.PAYSTACK:
        return create_paystack_checkout(tenant_id, request)

    raise AppError(
        code="invalid_provider",
        message=f"Unknown payment provider: {request.provider}",
        status_code=400,
    )
