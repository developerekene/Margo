"""Billing service — business logic for subscriptions, limits, and access."""
import logging
from datetime import UTC, datetime, timedelta

import httpx
import stripe
from google.api_core.exceptions import AlreadyExists

from app.core.config import settings
from app.core.responses import AppError
from app.modules.billing import ports
from app.modules.billing.constants import INVOICES, SUBSCRIPTIONS
from app.modules.billing.plans import PLANS, TRIAL_DAYS, TRIAL_PLAN_ID
from app.modules.billing.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    InvoiceItem,
    InvoiceListResponse,
    LimitedResource,
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
        _create_trial(get_db(), tenant_id, admin_email)
    except Exception:
        # Billing failure must not block tenant registration.
        # Log for alerting; get_subscription / checkout self-heal by
        # provisioning a trial the first time the tenant needs one.
        logger.exception(
            "Failed to create trial subscription for tenant=%s email=%s",
            tenant_id,
            admin_email,
        )


def _create_trial(db, tenant_id: str, admin_email: str | None) -> bool:
    """Create the tenant's trial subscription once. Returns True if created.

    Safe against duplicate events and races: the document id is the tenant id
    and Firestore create() fails if it already exists. The query also covers
    older records that were created with a random id.
    """
    if ports.load_subscription(db, tenant_id) is not None:
        logger.info("Subscription exists for tenant=%s, skipping trial.", tenant_id)
        return False

    now = datetime.now(UTC)
    try:
        db.collection(SUBSCRIPTIONS).document(tenant_id).create(
            {
                "subscription_id": tenant_id,
                "tenant_id": tenant_id,
                "plan_id": TRIAL_PLAN_ID,
                "status": SubscriptionStatus.TRIAL.value,
                "trial_end": now + timedelta(days=TRIAL_DAYS),
                # Stored for provider checkout (Paystack needs an email).
                "admin_email": admin_email,
                "created_at": now,
                "updated_at": now,
            }
        )
    except AlreadyExists:
        return False

    logger.info(
        "Trial subscription created: tenant=%s plan=%s trial_days=%d",
        tenant_id,
        TRIAL_PLAN_ID,
        TRIAL_DAYS,
    )
    return True


def _usage_summary(tenant_id: str) -> UsageSummary:
    """Real consumption from Firestore. Raises on read errors (never fake zeros)."""
    return UsageSummary(
        users=ports.get_usage(tenant_id, LimitedResource.USERS.value),
        documents=ports.get_usage(tenant_id, LimitedResource.DOCUMENTS.value),
        crawl_pages_this_month=ports.get_usage(
            tenant_id, LimitedResource.CRAWL_PAGES.value
        ),
        monthly_messages_this_month=ports.get_usage(
            tenant_id, LimitedResource.MONTHLY_MESSAGES.value
        ),
        widget_domains=ports.get_usage(tenant_id, LimitedResource.WIDGET_DOMAINS.value),
    )


def get_subscription(
    tenant_id: str, create_if_missing: bool = False
) -> SubscriptionResponse:
    """Return the subscription for a tenant, with effective status and usage.

    create_if_missing: provision a trial for a tenant that has none (the
    TenantRegistered handler failed, or the tenant predates billing). Only
    pass True for a caller who belongs to the tenant, never for a platform
    admin probing arbitrary ids.

    Raises AppError(subscription_not_found, 404) if there is still none.
    """
    db = get_db()
    data = ports.load_subscription(db, tenant_id)

    if data is None and create_if_missing:
        _create_trial(db, tenant_id, admin_email=None)
        data = ports.load_subscription(db, tenant_id)

    if data is None:
        raise AppError(
            code="subscription_not_found",
            message="No subscription found for this tenant.",
            status_code=404,
        )

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

    return SubscriptionResponse(
        subscription_id=data["subscription_id"],
        tenant_id=data["tenant_id"],
        plan_id=plan.plan_id,
        plan_name=plan.name,
        status=ports.effective_status(data),
        trial_end=data.get("trial_end"),
        current_period_end=data.get("current_period_end"),
        provider=data.get("provider"),
        limits=plan.limits,
        usage=_usage_summary(tenant_id),
        created_at=data["created_at"],
        cancel_at_period_end=bool(data.get("cancel_at_period_end", False)),
        access_level=ports.access_level_for(data),
    )


# ---------------------------------------------------------------------------
# Stripe checkout
# ---------------------------------------------------------------------------


def _checkout_subscription(db, tenant_id: str):
    """Return (ref, data) for checkout, provisioning a trial if none exists.

    Refuses to start a second paid checkout while a paid subscription is
    active, which would double-bill the tenant. Plan changes need the
    upgrade policy Margo has not confirmed yet.
    """
    query = (
        db.collection(SUBSCRIPTIONS).where("tenant_id", "==", tenant_id).limit(1)
    )
    docs = query.get()
    if not docs:
        _create_trial(db, tenant_id, admin_email=None)
        docs = query.get()
    if not docs:
        raise AppError(
            code="subscription_not_found",
            message="No subscription found for this tenant.",
            status_code=404,
        )
    data = docs[0].to_dict()
    if data.get("provider") and ports.effective_status(data) == (
        SubscriptionStatus.ACTIVE
    ):
        raise AppError(
            code="subscription_already_active",
            message="This tenant already has an active paid subscription.",
            status_code=409,
        )
    return docs[0].reference, data


def _stripe_price_id(plan_id: str) -> str:
    """Return the configured Stripe Price ID for a plan, or empty string."""
    return {
        "professional": settings.STRIPE_PRICE_PROFESSIONAL,
        "enterprise": settings.STRIPE_PRICE_ENTERPRISE,
    }.get(plan_id, "")


def create_stripe_checkout(
    tenant_id: str, request: CheckoutRequest, customer_email: str | None = None
) -> CheckoutResponse:
    """Create a Stripe Checkout Session and return the redirect URL.

    Flow:
    1. Validate Stripe config and plan.
    2. Get or create a Stripe Customer for this tenant (stored on the sub doc).
    3. Create a Checkout Session in subscription mode.
    4. Return the session URL — the webhook handles the post-payment upgrade.
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
    sub_ref, sub_data = _checkout_subscription(db, tenant_id)

    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Reuse existing Stripe customer or create a new one.
    # Stored on the subscription doc for idempotency — repeated checkout
    # attempts for the same tenant reuse the same Stripe customer.
    stripe_customer_id = sub_data.get("stripe_customer_id")
    if not stripe_customer_id:
        customer = stripe.Customer.create(
            email=customer_email,
            metadata={"tenant_id": tenant_id},
            # Same key -> Stripe returns the same customer if two checkouts race.
            idempotency_key=f"margo-customer-{tenant_id}",
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
        client_reference_id=tenant_id,
        # Metadata is read by the checkout.session.completed webhook handler.
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


def _paystack_amount(plan_id: str) -> int:
    """Configured plan price in minor units (0 = not configured)."""
    return {
        "professional": settings.PAYSTACK_AMOUNT_PROFESSIONAL,
        "enterprise": settings.PAYSTACK_AMOUNT_ENTERPRISE,
    }.get(plan_id, 0)


def _paystack_plan_code(plan_id: str) -> str:
    """Return the configured Paystack Plan Code for a plan, or empty string."""
    return {
        "professional": settings.PAYSTACK_PLAN_PROFESSIONAL,
        "enterprise": settings.PAYSTACK_PLAN_ENTERPRISE,
    }.get(plan_id, "")


def create_paystack_checkout(
    tenant_id: str, request: CheckoutRequest, customer_email: str | None = None
) -> CheckoutResponse:
    """Initialize a Paystack transaction and return the authorization_url.

    Flow:
    1. Validate Paystack config and plan.
    2. Use the logged-in owner's email (fallback: admin_email on the sub doc).
    3. POST to Paystack /transaction/initialize with the plan code.
    4. Return the authorization_url — the webhook handler upgrades the subscription.
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
    _, sub_data = _checkout_subscription(db, tenant_id)
    admin_email = customer_email or sub_data.get("admin_email", "")
    if not admin_email:
        raise AppError(
            code="tenant_email_missing",
            message="Tenant email is not available. Contact support.",
            status_code=500,
        )

    try:
        body: dict = {
            "email": admin_email,
            "plan": plan_code,
            "callback_url": settings.PAYSTACK_CALLBACK_URL,
            # Metadata read by the charge.success webhook handler.
            "metadata": {"tenant_id": tenant_id, "plan_id": request.plan_id},
        }
        # Paystack's docs example sends the plan amount alongside the plan
        # code (the plan's own amount wins). Sent only when configured.
        amount = _paystack_amount(request.plan_id)
        if amount:
            body["amount"] = amount
        response = httpx.post(
            _PAYSTACK_INITIALIZE_URL,
            json=body,
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


def create_checkout(
    tenant_id: str, request: CheckoutRequest, customer_email: str | None = None
) -> CheckoutResponse:
    """Dispatch checkout creation to the requested provider."""
    if request.provider == PaymentProvider.STRIPE:
        return create_stripe_checkout(tenant_id, request, customer_email)

    if request.provider == PaymentProvider.PAYSTACK:
        return create_paystack_checkout(tenant_id, request, customer_email)

    raise AppError(
        code="invalid_provider",
        message=f"Unknown payment provider: {request.provider}",
        status_code=400,
    )


# ---------------------------------------------------------------------------
# Invoice history
# ---------------------------------------------------------------------------


def list_invoices(
    tenant_id: str, limit: int = 20, cursor: str | None = None
) -> InvoiceListResponse:
    """Return the tenant's invoices, newest first, from our own normalized
    records (written by the webhook handlers), never a raw provider payload.

    cursor is the ISO date of the last item of the previous page.
    """
    query = (
        get_db()
        .collection(INVOICES)
        .document(tenant_id)
        .collection("items")
        .order_by("date", direction="DESCENDING")
    )
    if cursor:
        try:
            query = query.start_after({"date": datetime.fromisoformat(cursor)})
        except ValueError:
            raise AppError(
                code="invalid_cursor",
                message="The pagination cursor is not valid.",
                status_code=400,
            )

    docs = query.limit(limit + 1).get()
    page, has_more = docs[:limit], len(docs) > limit
    items = [InvoiceItem(**d.to_dict()) for d in page]
    next_cursor = items[-1].date.isoformat() if has_more and items else None
    return InvoiceListResponse(invoices=items, next_cursor=next_cursor)