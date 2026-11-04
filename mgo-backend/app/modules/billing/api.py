"""Billing API router.

All billing endpoints live here. Auth is handled by billing/permissions.py,
which wraps app.shared.auth - never importing from identity directly.

Route ordering matters: /webhook/* must come BEFORE /{tenant_id}/* so FastAPI
does not try to match "webhook" as a tenant_id path parameter.

Webhook contract (API Contract section 9): paths are /billing/webhook/stripe
and /billing/webhook/paystack. Any failure while processing returns non-2xx so
the provider retries; duplicates and ignored event types return 200.
"""

import json
import logging
from functools import partial

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.responses import AppError, envelope
from app.modules.billing import paystack_webhooks, service, webhook_runner, webhooks
from app.modules.billing.permissions import (
    require_billing_access,
    require_billing_owner,
)
from app.modules.billing.schemas import CheckoutRequest, SubscriptionResponse

logger = logging.getLogger("margo")

router = APIRouter()


async def _process(provider: str, event_id: str, event_type: str, apply) -> dict:
    """Run a handler idempotently off the event loop (Firestore is blocking)."""
    try:
        outcome = await run_in_threadpool(
            webhook_runner.run_idempotent, provider, event_id, event_type, apply
        )
    except AppError:
        raise
    except Exception:
        logger.exception(
            "Webhook processing failed: provider=%s type=%s id=%s",
            provider,
            event_type,
            event_id,
        )
        raise AppError(
            code="webhook_processing_failed",
            message="Event processing failed; it will be retried.",
            status_code=500,
        )
    return envelope(data={"received": True, "outcome": outcome})


# ---------------------------------------------------------------------------
# Webhook endpoints (public - no auth header, provider calls these directly)
# ---------------------------------------------------------------------------


@router.post("/webhook/stripe", response_model=dict)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
) -> dict:
    """Receive and process Stripe webhook events (signature verified first)."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise AppError(
            code="stripe_not_configured",
            message="Stripe webhook secret is not configured.",
            status_code=503,
        )

    # Raw bytes - signature verification needs the original payload.
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed.")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    except Exception as exc:
        logger.error("Stripe webhook parsing error: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = event.get("type")
    event_id = event.get("id")
    logger.info("Stripe webhook received: type=%s id=%s", event_type, event_id)

    handler = webhooks.STRIPE_HANDLERS.get(event_type)
    if handler is None:
        return envelope(data={"received": True, "outcome": "ignored"})

    return await _process(
        "stripe", event_id, event_type, partial(handler, event=event)
    )


@router.post("/webhook/paystack", response_model=dict)
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str | None = Header(None),
) -> dict:
    """Receive and process Paystack webhook events (signature verified first)."""
    if not settings.PAYSTACK_SECRET_KEY:
        raise AppError(
            code="paystack_not_configured",
            message="Paystack is not configured on this server.",
            status_code=503,
        )

    payload = await request.body()

    if not paystack_webhooks.verify_signature(
        payload, x_paystack_signature, settings.PAYSTACK_SECRET_KEY
    ):
        logger.warning("Paystack webhook signature verification failed.")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        event = json.loads(payload)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = event.get("event") if isinstance(event, dict) else None
    logger.info("Paystack webhook received: type=%s", event_type)

    handler = paystack_webhooks.PAYSTACK_HANDLERS.get(event_type)
    if handler is None:
        return envelope(data={"received": True, "outcome": "ignored"})

    return await _process(
        "paystack",
        paystack_webhooks.event_key(event_type, payload),
        event_type,
        partial(handler, event=event),
    )


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------


@router.get("/{tenant_id}/subscription", response_model=dict)
def get_subscription(
    tenant_id: str,
    user: dict = Depends(require_billing_access()),
) -> dict:
    """Return the current plan, status, entitlement limits, and usage.

    Auth: company_owner or company_admin of own tenant, or platform_admin.
    A tenant member with no subscription record gets a trial provisioned; a
    platform admin never does (so arbitrary ids cannot create records).
    """
    result: SubscriptionResponse = service.get_subscription(
        tenant_id, create_if_missing=user.get("role") != "platform_admin"
    )
    return envelope(data=result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@router.post("/{tenant_id}/checkout", response_model=dict)
def create_checkout(
    tenant_id: str,
    request: CheckoutRequest,
    user: dict = Depends(require_billing_owner()),
) -> dict:
    """Initiate a payment provider checkout session and return the redirect URL.

    Auth: company_owner only (not admin) - per API Contract section 3.2.
    The client redirects the user to checkout_url; the provider's webhook
    upgrades the subscription once payment is confirmed.
    """
    result = service.create_checkout(
        tenant_id, request, customer_email=user.get("email")
    )
    return envelope(data=result.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


@router.get("/{tenant_id}/invoices", response_model=dict)
def list_invoices(
    tenant_id: str,
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    _user: dict = Depends(require_billing_owner()),
) -> dict:
    """Invoice history for the tenant (owner only), newest first."""
    result = service.list_invoices(tenant_id, limit=limit, cursor=cursor)
    return envelope(data=result.model_dump(mode="json"))