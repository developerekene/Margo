"""Billing API router.

All billing endpoints live here. Auth is handled by billing/permissions.py,
which wraps app.shared.auth — never importing from identity directly.

Route ordering matters: /webhooks/* must come BEFORE /{tenant_id}/* so FastAPI
does not try to match "webhooks" as a tenant_id path parameter.
"""

import logging

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.core.config import settings
from app.core.responses import AppError, envelope
from app.modules.billing import service, webhooks
from app.modules.billing.permissions import (
    require_billing_access,
    require_billing_owner,
)
from app.modules.billing.schemas import CheckoutRequest, SubscriptionResponse

logger = logging.getLogger("margo")

router = APIRouter()


# ---------------------------------------------------------------------------
# Webhook endpoints (public — no auth header, provider calls these directly)
# Must be declared before /{tenant_id}/* routes.
# ---------------------------------------------------------------------------


@router.post("/webhooks/stripe", response_model=dict)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
) -> dict:
    """Receive and process Stripe webhook events.

    Security: signature is verified with stripe.Webhook.construct_event before
    any processing occurs. Invalid or tampered payloads are rejected with 400.

    Supported events:
      - checkout.session.completed
      - invoice.payment_succeeded
      - invoice.payment_failed
      - customer.subscription.deleted
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise AppError(
            code="stripe_not_configured",
            message="Stripe webhook secret is not configured.",
            status_code=503,
        )

    # Read raw bytes — Stripe signature verification requires the original payload.
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError:
        # Invalid signature — reject immediately, log for alerting.
        logger.warning("Stripe webhook signature verification failed.")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    except Exception as exc:
        logger.error("Stripe webhook parsing error: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = event.get("type")
    logger.info("Stripe webhook received: type=%s id=%s", event_type, event.get("id"))

    _STRIPE_HANDLERS = {
        "checkout.session.completed": webhooks.handle_checkout_session_completed,
        "invoice.payment_succeeded": webhooks.handle_invoice_payment_succeeded,
        "invoice.payment_failed": webhooks.handle_invoice_payment_failed,
        "customer.subscription.deleted": webhooks.handle_subscription_deleted,
    }

    handler = _STRIPE_HANDLERS.get(event_type)
    if handler:
        try:
            handler(event)
        except Exception:
            # Log failures but return 200 — Stripe retries on non-2xx responses,
            # which could cause duplicate processing on transient errors.
            logger.exception(
                "Stripe webhook handler failed: type=%s id=%s", event_type, event.get("id")
            )
    else:
        # Unhandled event types are acknowledged silently — not an error.
        logger.debug("Stripe webhook event ignored: type=%s", event_type)

    # Stripe expects 200 to confirm receipt.
    return envelope(data={"received": True})


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------


@router.get("/{tenant_id}/subscription", response_model=dict)
def get_subscription(
    tenant_id: str,
    _user: dict = Depends(require_billing_access()),
) -> dict:
    """Return the current plan, status, entitlement limits, and usage.

    Auth: company_owner or company_admin of own tenant, or platform_admin.
    """
    result: SubscriptionResponse = service.get_subscription(tenant_id)
    return envelope(data=result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@router.post("/{tenant_id}/checkout", response_model=dict)
def create_checkout(
    tenant_id: str,
    request: CheckoutRequest,
    _user: dict = Depends(require_billing_owner()),
) -> dict:
    """Initiate a payment provider checkout session and return the redirect URL.

    Auth: company_owner only (not admin) — per API Contract §3.2.
    The client should redirect the user to checkout_url to complete payment.
    After payment, the provider's webhook upgrades the subscription status.
    """
    result = service.create_checkout(tenant_id, request)
    return envelope(data=result.model_dump(mode="json"))
